// Headless bots for tuning the level generator.
//
// Two controllers share one noisy-perception player model and play every
// generated level through the real sim (createSimState/updateSim):
// - GREEDY reads only the current gate row: it estimates both outcomes and
//   picks the bigger-looking one. Estimates carry multiplicative perception
//   noise, and multipliers get a small "flashiness" bias, so obvious pairs
//   are always picked right while trap pairs are mis-picked often.
// - PLAN reads one row ahead, but only when it needs to: a clearly better
//   side is taken on the one-row read (identical to greedy), while a close
//   call gets the arithmetic done: both operators are visible on the current
//   and the next row, so the planner computes the exact best two-step path.
//   Sequenced traps (L12+) are built to be close calls whose greedy read is
//   wrong, so this is where the two bots separate.
// Both dodge enemy clumps with the same imperfect reaction, and both NEVER
// pick gamble gates: they aim outside the middle third of any trio row.
//
// Runs TRIALS seeded attempts per level per bot and prints both win-rate
// curves. Deterministic end to end: same code + config → same curves (gamble
// gates roll from a seed derived from the trial RNG, though the bots never
// touch them).
//
// Run with: npm run bot   (or: npx tsx scripts/bot.ts)

import { CONFIG } from '../src/game/config';
import { applyOp } from '../src/game/ops';
import { getLevel, optimalFinalCount } from '../src/game/levels';
import { mulberry32, type Rng } from '../src/game/rng';
import { createSimState, updateSim } from '../src/game/sim';
import type { GateOp, LevelDef } from '../src/game/types';

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
  // Extra clearance beyond the middle third when a trio row has a gamble,
  // enforced only this close (world-z) to the row — enemy clumps keep 5z
  // from gates, so dodges finish before the clamp takes over.
  gambleMargin: 0.1,
  gambleClampZ: 3,
  // Planner only: a one-row read whose perceived outcomes are within this
  // ratio counts as a close call and is re-scored one row deeper.
  planCloseRatio: 1.65,
  // Hard cap on simulated seconds per attempt.
  maxSimSeconds: 60,
};

function gaussian(rng: Rng): number {
  // Box-Muller; rng() is in [0,1), guard the log.
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Perceived size of a true outcome: log-normal noise plus multiplier flash. */
function perceive(rng: Rng, value: number, mulCount: number): number {
  return (
    Math.max(1, value) *
    Math.exp(gaussian(rng) * BOT.perceptionSigma) *
    Math.pow(BOT.mulBias, mulCount)
  );
}

/**
 * Pick a side for gate `i`. Both bots start from the same noisy one-row
 * read. Greedy commits to it. The planner commits too when one side clearly
 * dominates, but on a close call it works the visible numbers: the exact
 * best two-step outcome through the next row (when there is one) decides.
 * Gamble middles are never candidates for either bot.
 */
function decideSide(rng: Rng, level: LevelDef, i: number, count: number, plan: boolean): -1 | 1 {
  const gate = level.gatePairs[i];
  const seenLeft = perceive(rng, applyOp(count, gate.left), gate.left.kind === 'mul' ? 1 : 0);
  const seenRight = perceive(rng, applyOp(count, gate.right), gate.right.kind === 'mul' ? 1 : 0);
  let side: -1 | 1 = seenLeft >= seenRight ? -1 : 1;

  const next = level.gatePairs[i + 1];
  const close = Math.max(seenLeft, seenRight) < Math.min(seenLeft, seenRight) * BOT.planCloseRatio;
  if (plan && next && close) {
    const deep = (op: GateOp): number => {
      const after = applyOp(count, op);
      return Math.max(applyOp(after, next.left), applyOp(after, next.right));
    };
    const deepLeft = deep(gate.left);
    const deepRight = deep(gate.right);
    if (deepLeft !== deepRight) {
      side = deepLeft > deepRight ? -1 : 1;
    }
  }

  if (rng() < BOT.blunderChance) {
    side = side === -1 ? 1 : -1;
  }
  return side;
}

export function playOnce(
  level: LevelDef,
  rng: Rng,
  plan: boolean,
  // Tooling hook: inspect the final sim state (e.g. assert no gamble hits).
  probe?: (sim: ReturnType<typeof createSimState>) => void
): boolean {
  // Gamble rolls draw from a per-attempt seed; the bots never trigger them,
  // but the sim stays fully deterministic either way.
  const s = createSimState(level, { gambleSeed: Math.floor(rng() * 0xffffffff) });
  const dt = CONFIG.engine.fixedStep;
  const maxSteps = Math.ceil(BOT.maxSimSeconds / dt);

  // Pre-roll per-clump dodge reactions so a missed dodge stays missed.
  const dodgeOk = level.enemies.map(() => rng() < BOT.dodgeSkill);
  // -1 = aim left, 1 = aim right, per gate, decided on approach.
  const chosenSide: (0 | -1 | 1)[] = level.gatePairs.map(() => 0);

  for (let step = 0; step < maxSteps; step++) {
    // Decide the next undecided gate once it comes into view.
    let baseTarget = 0;
    let nextGateZ = Infinity;
    let nextGateIdx = -1;
    for (let i = 0; i < s.gates.length; i++) {
      const gate = s.gates[i];
      if (gate.used) {
        continue;
      }
      nextGateZ = gate.z;
      nextGateIdx = i;
      if (chosenSide[i] === 0 && gate.z - s.distance < BOT.decisionDistance) {
        chosenSide[i] = decideSide(rng, level, i, s.count, plan);
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

    // Never pick gamble gates: crossing a trio row, stay clear of the middle
    // third (this outranks a dodge line that drifts toward centre, but only
    // right at the row so it never cancels an earlier dodge).
    if (
      nextGateIdx >= 0 &&
      level.gatePairs[nextGateIdx].middle &&
      nextGateZ - s.distance < BOT.gambleClampZ
    ) {
      const minX = CONFIG.gates.trioThirdX + BOT.gambleMargin;
      if (Math.abs(target) < minX) {
        const dir =
          chosenSide[nextGateIdx] !== 0 ? chosenSide[nextGateIdx] : target >= 0 ? 1 : -1;
        target = dir * Math.max(minX, BOT.gateAimX);
      }
    }

    s.targetX = target;
    const phase = updateSim(s, dt);
    if (phase === 'won' || phase === 'lost') {
      probe?.(s);
      return phase === 'won';
    }
  }
  probe?.(s);
  return false;
}

export function winRate(levelNumber: number, trials: number, plan: boolean): number {
  const level = getLevel(levelNumber);
  let wins = 0;
  for (let trial = 0; trial < trials; trial++) {
    const rng = mulberry32(levelNumber * 1_000_003 + trial * 7919 + 17);
    if (playOnce(level, rng, plan)) {
      wins++;
    }
  }
  return wins / trials;
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`.padStart(6);
}

function main(): void {
  const seqStart = CONFIG.levels.seqTrapStartLevel;
  console.log(`gate-runner bots — ${LEVELS} levels x ${TRIALS} trials each`);
  console.log('lvl | boss | optimal | pairs | enemies | greedy |   plan | diff');
  console.log('----+------+---------+-------+---------+--------+--------+------');
  const greedyCurve: number[] = [];
  const planCurve: number[] = [];
  for (let levelNumber = 1; levelNumber <= LEVELS; levelNumber++) {
    const level = getLevel(levelNumber);
    const greedy = winRate(levelNumber, TRIALS, false);
    const plan = winRate(levelNumber, TRIALS, true);
    greedyCurve.push(greedy);
    planCurve.push(plan);
    const enemyUnits = level.enemies.reduce((sum, e) => sum + e.count, 0);
    console.log(
      `${String(levelNumber).padStart(3)} | ${String(level.boss.count).padStart(4)} | ` +
        `${String(optimalFinalCount(level)).padStart(7)} | ` +
        `${String(level.gatePairs.length).padStart(5)} | ` +
        `${String(enemyUnits).padStart(7)} | ${pct(greedy)} | ${pct(plan)} | ` +
        `${((plan - greedy) * 100).toFixed(1)}`
    );
  }
  console.log('----+------+---------+-------+---------+--------+--------+------');
  const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
  const pre = (xs: number[]): number[] => xs.slice(0, seqStart - 1);
  const post = (xs: number[]): number[] => xs.slice(seqStart - 1);
  console.log(
    `mean win rate: greedy ${pct(mean(greedyCurve))}  plan ${pct(mean(planCurve))}`
  );
  console.log(
    `levels 1-${seqStart - 1}:  greedy ${pct(mean(pre(greedyCurve)))}  plan ${pct(mean(pre(planCurve)))}`
  );
  console.log(
    `levels ${seqStart}+:   greedy ${pct(mean(post(greedyCurve)))}  plan ${pct(mean(post(planCurve)))}  ` +
      `(planner ahead by ${((mean(post(planCurve)) - mean(post(greedyCurve))) * 100).toFixed(1)}pp)`
  );
  console.log(`greedy curve: ${greedyCurve.map((r) => Math.round(r * 100)).join(' ')}`);
  console.log(`plan curve:   ${planCurve.map((r) => Math.round(r * 100)).join(' ')}`);
}

// Run the report only when executed directly (the tuning sweep imports us).
if (process.argv[1] && /bot\.(ts|js)$/.test(process.argv[1])) {
  main();
}
