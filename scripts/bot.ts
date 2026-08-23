// Headless greedy bot for tuning the level generator.
//
// Plays every generated level through the real sim (createSimState/updateSim)
// with a greedy controller that models a decent casual player:
// - At each gate pair it estimates both outcomes and picks the bigger-looking
//   one. Estimates carry multiplicative perception noise, and multipliers get
//   a small "flashiness" bias, so obvious pairs are always picked right while
//   trap pairs (x2 vs +K near break-even) are mis-picked roughly half the time.
// - It steers to dodge enemy clumps, but misses the dodge on a fixed fraction
//   of clumps (late reaction), eating the hit.
//
// Runs TRIALS seeded attempts per level and prints the win rate per level.
// Deterministic end to end: same code + config → same curve.
//
// Run with: npm run bot   (or: npx tsx scripts/bot.ts)

import { CONFIG } from '../src/game/config';
import { applyOp } from '../src/game/ops';
import { getLevel, optimalFinalCount } from '../src/game/levels';
import { mulberry32, type Rng } from '../src/game/rng';
import { createSimState, updateSim } from '../src/game/sim';
import type { LevelDef } from '../src/game/types';

const TRIALS = 400;
const LEVELS = CONFIG.levels.loopCount;

// Player model tunables (bot-only; gameplay tunables stay in config.ts).
const BOT = {
  // Std-dev of the log-normal noise on each gate outcome estimate.
  perceptionSigma: 0.22,
  // Multiplier outcomes look this much bigger than they are ("x2 is flashy").
  mulBias: 1.06,
  // Chance per gate of a plain blunder: picking the worse-looking side
  // (fat finger, late steer).
  blunderChance: 0.012,
  // Probability of reacting in time to dodge any given enemy clump.
  dodgeSkill: 0.85,
  // World-z lookahead for enemy dodging and gate decisions.
  dodgeLookahead: 10,
  decisionDistance: 20,
  // Normalized-x the bot aims at inside the chosen gate half.
  gateAimX: 0.45,
  // Extra clearance beyond the sim's hit window when planning a dodge.
  dodgeMargin: 0.14,
  // Hard cap on simulated seconds per attempt.
  maxSimSeconds: 60,
};

function gaussian(rng: Rng): number {
  // Box-Muller; rng() is in [0,1), guard the log.
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function playOnce(level: LevelDef, rng: Rng): boolean {
  const s = createSimState(level);
  const dt = CONFIG.engine.fixedStep;
  const maxSteps = Math.ceil(BOT.maxSimSeconds / dt);

  // Pre-roll per-clump dodge reactions so a missed dodge stays missed.
  const dodgeOk = level.enemies.map(() => rng() < BOT.dodgeSkill);
  // -1 = aim left, 1 = aim right, per gate, decided on approach.
  const chosenSide: (0 | -1 | 1)[] = level.gatePairs.map(() => 0);

  for (let step = 0; step < maxSteps; step++) {
    // Decide the next undecided gate once it comes into view: greedy on the
    // noisily perceived outcomes.
    let baseTarget = 0;
    let nextGateZ = Infinity;
    for (let i = 0; i < s.gates.length; i++) {
      const gate = s.gates[i];
      if (gate.used) {
        continue;
      }
      nextGateZ = gate.z;
      if (chosenSide[i] === 0 && gate.z - s.distance < BOT.decisionDistance) {
        const left = applyOp(s.count, gate.left);
        const right = applyOp(s.count, gate.right);
        const seenLeft =
          left *
          Math.exp(gaussian(rng) * BOT.perceptionSigma) *
          (gate.left.kind === 'mul' ? BOT.mulBias : 1);
        const seenRight =
          right *
          Math.exp(gaussian(rng) * BOT.perceptionSigma) *
          (gate.right.kind === 'mul' ? BOT.mulBias : 1);
        let side: -1 | 1 = seenLeft >= seenRight ? -1 : 1;
        if (rng() < BOT.blunderChance) {
          side = side === -1 ? 1 : -1;
        }
        chosenSide[i] = side;
      }
      baseTarget = chosenSide[i] * BOT.gateAimX;
      break;
    }

    // Dodge the nearest upcoming enemy clump if the reaction roll allowed it.
    let target = baseTarget;
    let nearest = -1;
    for (let i = 0; i < s.enemies.length; i++) {
      const e = s.enemies[i];
      // Ignore clumps beyond the next gate: crossing the gate on the right
      // side comes first, the dodge happens after.
      if (!e.alive || e.z <= s.distance || e.z - s.distance > BOT.dodgeLookahead || e.z > nextGateZ) {
        continue;
      }
      if (nearest < 0 || e.z < s.enemies[nearest].z) {
        nearest = i;
      }
    }
    if (nearest >= 0 && dodgeOk[nearest]) {
      const e = s.enemies[nearest];
      const clearance = CONFIG.enemies.hitWindowX + BOT.dodgeMargin;
      if (Math.abs(target - e.x) < clearance) {
        const leftDodge = e.x - clearance;
        const rightDodge = e.x + clearance;
        const pickLeft =
          Math.abs(leftDodge - baseTarget) <= Math.abs(rightDodge - baseTarget)
            ? Math.abs(leftDodge) <= CONFIG.run.maxCrowdX
            : Math.abs(rightDodge) > CONFIG.run.maxCrowdX;
        const dodge = pickLeft ? leftDodge : rightDodge;
        target = Math.max(-CONFIG.run.maxCrowdX, Math.min(CONFIG.run.maxCrowdX, dodge));
      }
    }

    s.targetX = target;
    const phase = updateSim(s, dt);
    if (phase === 'won') {
      return true;
    }
    if (phase === 'lost') {
      return false;
    }
  }
  return false;
}

export function winRate(levelNumber: number, trials: number): number {
  const level = getLevel(levelNumber);
  let wins = 0;
  for (let trial = 0; trial < trials; trial++) {
    const rng = mulberry32(levelNumber * 1_000_003 + trial * 7919 + 17);
    if (playOnce(level, rng)) {
      wins++;
    }
  }
  return wins / trials;
}

function main(): void {
  console.log(`gate-runner bot — ${LEVELS} levels x ${TRIALS} trials`);
  console.log('lvl | boss | optimal | pairs | enemies | win rate');
  console.log('----+------+---------+-------+---------+---------');
  let total = 0;
  const curve: number[] = [];
  for (let levelNumber = 1; levelNumber <= LEVELS; levelNumber++) {
    const level = getLevel(levelNumber);
    const rate = winRate(levelNumber, TRIALS);
    curve.push(rate);
    total += rate;
    const enemyUnits = level.enemies.reduce((sum, e) => sum + e.count, 0);
    console.log(
      `${String(levelNumber).padStart(3)} | ${String(level.boss.count).padStart(4)} | ` +
        `${String(optimalFinalCount(level)).padStart(7)} | ` +
        `${String(level.gatePairs.length).padStart(5)} | ` +
        `${String(enemyUnits).padStart(7)} | ${(rate * 100).toFixed(1)}%`
    );
  }
  console.log('----+------+---------+-------+---------+---------');
  console.log(`mean win rate: ${((total / LEVELS) * 100).toFixed(1)}%`);
  console.log(
    `curve: ${curve.map((r) => Math.round(r * 100)).join(' ')}`
  );
}

// Run the report only when executed directly (the tuning sweep imports us).
if (process.argv[1] && /bot\.(ts|js)$/.test(process.argv[1])) {
  main();
}
