import { CONFIG } from './config';
import { applyOp } from './ops';
import { mulberry32, range, rangeInt, type Rng } from './rng';
import type { EnemyClumpDef, GateOp, GatePairDef, LevelDef } from './types';
import { clamp, lerp } from '../engine/utils';

// Deterministic seeded level generator.
//
// Each level is generated from a seed derived from its number, so layouts are
// stable across runs and devices. The generator tracks the greedy-optimal
// crowd count as it emits gates so operator values, enemy sizes and the boss
// number all scale with what a well-played crowd would actually have. Levels
// past loopCount reuse the 30 base layouts with the boss growing +30% per
// cycle (endless mode).
//
// Difficulty ramp (all tunables in CONFIG.levels):
// - Early levels: every pair is an obvious good-vs-bad choice, boss well
//   below the optimal count.
// - From gambleStartLevel: about 1 in 4 levels gets a purple gamble gate
//   (50/50 x3 or ÷3) as the middle of one trio — never forced, and drawn
//   from a side RNG stream so the base layout doesn't reroll.
// - From trapStartLevel: "trap" pairs — two teal gates (x2 vs +K) where the
//   bigger-looking multiplier is often the worse pick at the current count.
// - From seqTrapStartLevel: sequenced traps spanning two rows — a trap pair
//   whose add side is strictly better, then a flat-subtraction squeeze pair.
//   The squeeze widens the relative gap between the trap's outcomes, so only
//   reading the next row (now rendered ahead) separates the choices.
// - From splitStartLevel: near-even split pairs (+K vs x1.5) whose outcomes
//   are within a few percent, plus a boss fraction close to optimal, so
//   sloppy picks and enemy hits actually cost the level.

export function getLevel(levelNumber: number): LevelDef {
  const L = CONFIG.levels;
  const n = Math.max(1, Math.floor(levelNumber));
  const baseLevel = ((n - 1) % L.loopCount) + 1;
  const cycle = Math.floor((n - 1) / L.loopCount);
  const def = generateLevel(baseLevel);
  if (cycle > 0) {
    def.boss.count = Math.round(def.boss.count * Math.pow(L.endlessBossGrowth, cycle));
  }
  return def;
}

function generateLevel(baseLevel: number): LevelDef {
  const L = CONFIG.levels;
  const seed = baseLevel + L.seedOffset;
  const rng = mulberry32(seed);
  // Difficulty progression 0..1 across the 30 base levels.
  const t = (baseLevel - 1) / (L.loopCount - 1);

  const pairCount = clamp(
    Math.round(lerp(L.pairsMin, L.pairsMax, t) + range(rng, -0.6, 0.6)),
    L.pairsMin,
    L.pairsMax
  );
  const duration = clamp(
    lerp(L.durationMinSec, L.durationMaxSec, t) + range(rng, -0.8, 0.8),
    L.durationMinSec,
    L.durationMaxSec
  );
  const bossZ = Math.round(duration * CONFIG.run.speed);

  // Gate rows: evenly spread with a little jitter, always ascending.
  const lastGateZ = bossZ - L.lastGateGapZ;
  const spacing = (lastGateZ - L.firstGateZ) / Math.max(1, pairCount - 1);
  const gateZs: number[] = [];
  for (let i = 0; i < pairCount; i++) {
    const jitter = range(rng, -1, 1) * spacing * L.gateZJitterFrac;
    gateZs.push(Math.round(L.firstGateZ + i * spacing + (i > 0 && i < pairCount - 1 ? jitter : 0)));
  }

  const trapChance =
    baseLevel < L.trapStartLevel
      ? 0
      : L.trapChanceMax *
        Math.pow(
          (baseLevel - L.trapStartLevel + 1) / (L.loopCount - L.trapStartLevel + 1),
          L.trapRampExponent
        );
  const splitChance =
    baseLevel < L.splitStartLevel
      ? 0
      : (L.splitChanceMax * (baseLevel - L.splitStartLevel + 1)) /
        (L.loopCount - L.splitStartLevel + 1);

  // Sequenced traps span two consecutive rows; at most one per level, its
  // start row decided up front so the emit loop below stays linear.
  const seqChance =
    baseLevel < L.seqTrapStartLevel
      ? 0
      : lerp(
          L.seqTrapChanceL12,
          L.seqTrapChanceL30,
          (baseLevel - L.seqTrapStartLevel) / (L.loopCount - L.seqTrapStartLevel)
        );
  const seqRng = mulberry32(seed * 131 + 29);
  const seqStart =
    pairCount >= 2 && seqRng() < seqChance ? rangeInt(seqRng, 0, pairCount - 2) : -1;

  // Emit gates while tracking the greedy-optimal count and its value at each
  // row (used to scale enemies placed later).
  const startCount: number = CONFIG.crowd.startCount;
  let optimal = startCount;
  const gatePairs: GatePairDef[] = [];
  const optimalAfterZ: { z: number; count: number }[] = [];
  for (let i = 0; i < pairCount; i++) {
    const roll = rng();
    let pair: [GateOp, GateOp];
    if (i === seqStart) {
      pair = makeSeqTrapPair(seqRng, optimal);
    } else if (i === seqStart + 1 && seqStart >= 0) {
      pair = makeSeqSqueezePair(seqRng, optimal);
    } else if (roll < splitChance) {
      pair = makeSplitPair(rng, optimal);
    } else if (roll < splitChance + trapChance) {
      pair = makeTrapPair(rng, optimal);
    } else {
      pair = makeObviousPair(rng, optimal, t);
    }
    const swap = rng() < 0.5;
    const left = swap ? pair[1] : pair[0];
    const right = swap ? pair[0] : pair[1];
    gatePairs.push({ z: gateZs[i], left, right });
    optimal = Math.max(applyOp(optimal, left), applyOp(optimal, right));
    optimalAfterZ.push({ z: gateZs[i], count: optimal });
  }

  // Gamble gate: its own RNG stream, so adding it never rerolls the layout.
  const gambleRng = mulberry32(seed * 977 + 13);
  if (baseLevel >= L.gambleStartLevel && gambleRng() < L.gambleLevelChance) {
    const idx = rangeInt(gambleRng, 0, pairCount - 1);
    gatePairs[idx].middle = { kind: 'gamble', value: L.gambleValue };
  }

  const enemies = makeEnemies(rng, t, gateZs, bossZ, startCount, optimalAfterZ);

  const loseRate = lerp(
    L.targetLoseRateL1,
    L.targetLoseRateL30,
    Math.pow(t, L.targetLoseRateExponent)
  );
  const bossCount = Math.max(
    L.bossMin,
    bossFromPlayouts(seed, gatePairs, enemies, startCount, loseRate)
  );

  return {
    seed,
    startCount,
    gatePairs,
    enemies,
    boss: { z: bossZ, count: bossCount },
  };
}

/** Clearly good vs clearly bad: teal add/mul against red sub/div. */
function makeObviousPair(rng: Rng, count: number, t: number): [GateOp, GateOp] {
  const L = CONFIG.levels;
  const mulChance = lerp(L.obviousMulChanceL1, L.obviousMulChanceL30, t);
  const addFracMax = lerp(L.addFracMaxL1, L.addFracMaxL30, t);
  const good: GateOp =
    rng() < mulChance
      ? { kind: 'mul', value: L.mulValue }
      : { kind: 'add', value: niceValue(count * range(rng, L.addFracMin, addFracMax)) };
  const bad: GateOp =
    rng() < 0.35
      ? { kind: 'div', value: L.divValue }
      : { kind: 'sub', value: niceValue(count * range(rng, L.subFracMin, L.subFracMax)) };
  return [good, bad];
}

/**
 * Two teal gates: xM vs +K with K around the break-even c*(M-1), so the
 * flashier multiplier is the worse pick roughly half the time.
 */
function makeTrapPair(rng: Rng, count: number): [GateOp, GateOp] {
  const L = CONFIG.levels;
  const m = L.mulValue;
  const ratio = range(rng, L.trapRatioMin, L.trapRatioMax);
  const k = Math.max(1, niceValue(count * (m - 1) * ratio));
  return [
    { kind: 'mul', value: m },
    { kind: 'add', value: k },
  ];
}

/**
 * Sequenced trap, row A: x2 vs +K with K strictly above break-even, so the
 * add is always the right pick — but only by a margin that hides inside
 * one-row perception noise. Row B (below) is what exposes it.
 */
function makeSeqTrapPair(rng: Rng, count: number): [GateOp, GateOp] {
  const L = CONFIG.levels;
  const m = L.mulValue;
  const ratio = range(rng, L.seqTrapRatioMin, L.seqTrapRatioMax);
  const k = Math.max(1, niceValue(count * (m - 1) * ratio));
  return [
    { kind: 'mul', value: m },
    { kind: 'add', value: k },
  ];
}

/**
 * Sequenced trap, row B: -F vs ÷D, both red. F is a big flat bite of the
 * optimal count after row A (kept under half, so the sub side stays the
 * lesser evil on the optimal line). Subtracting a constant stretches the
 * RELATIVE gap between row A's two outcomes — planning across both rows
 * separates them clearly, a greedy one-row read does not.
 */
function makeSeqSqueezePair(rng: Rng, count: number): [GateOp, GateOp] {
  const L = CONFIG.levels;
  const f = Math.max(1, niceValue(count * range(rng, L.seqSqueezeFracMin, L.seqSqueezeFracMax)));
  return [
    { kind: 'sub', value: f },
    { kind: 'div', value: L.seqDivValue },
  ];
}

/** Near-even pair (+K vs x1.5): outcomes within a few percent either way. */
function makeSplitPair(rng: Rng, count: number): [GateOp, GateOp] {
  const L = CONFIG.levels;
  const m = L.splitMulValue;
  const ratio = range(rng, L.splitRatioMin, L.splitRatioMax);
  const k = Math.max(1, Math.round(count * (m - 1) * ratio));
  return [
    { kind: 'mul', value: m },
    { kind: 'add', value: k },
  ];
}

function makeEnemies(
  rng: Rng,
  t: number,
  gateZs: number[],
  bossZ: number,
  startCount: number,
  optimalAfterZ: { z: number; count: number }[]
): EnemyClumpDef[] {
  const L = CONFIG.levels;
  const clumps = rangeInt(
    rng,
    L.enemyClumpsMin,
    Math.max(L.enemyClumpsMin, Math.round(lerp(L.enemyClumpsMin, L.enemyClumpsMax, t)))
  );
  const zLo = Math.round(L.firstGateZ * 0.6);
  const zHi = bossZ - Math.round(L.lastGateGapZ / 2);
  const enemies: EnemyClumpDef[] = [];
  for (let i = 0; i < clumps; i++) {
    let z = -1;
    // Rejection-sample a row that keeps clearance from every gate and from
    // clumps already placed, so dodging is always physically possible.
    for (let attempt = 0; attempt < 40; attempt++) {
      const candidate = rangeInt(rng, zLo, zHi);
      const clearOfGates = gateZs.every((gz) => Math.abs(candidate - gz) >= L.enemyGateGapZ);
      const clearOfEnemies = enemies.every((e) => Math.abs(candidate - e.z) >= L.enemyGateGapZ);
      if (clearOfGates && clearOfEnemies) {
        z = candidate;
        break;
      }
    }
    if (z < 0) {
      // Dense layout: fall back to the most open row instead of dropping the
      // clump, so no level generates enemy-free.
      let bestZ = -1;
      let bestClearance = 0;
      for (let candidate = zLo; candidate <= zHi; candidate++) {
        const clearance = Math.min(
          ...gateZs.map((gz) => Math.abs(candidate - gz)),
          ...enemies.map((e) => Math.abs(candidate - e.z))
        );
        if (clearance > bestClearance) {
          bestClearance = clearance;
          bestZ = candidate;
        }
      }
      if (bestZ < 0 || bestClearance < 2) {
        continue;
      }
      z = bestZ;
    }
    // Scale the clump to the crowd a well-played run would bring to its row.
    let crowdHere = startCount;
    for (const g of optimalAfterZ) {
      if (g.z < z) {
        crowdHere = g.count;
      }
    }
    const count = Math.max(
      L.enemyMinCount,
      Math.round(crowdHere * range(rng, L.enemyCountFracMin, L.enemyCountFracMax))
    );
    enemies.push({ z, x: Math.round(range(rng, -L.enemyMaxX, L.enemyMaxX) * 20) / 20, count });
  }
  enemies.sort((a, b) => a.z - b.z);
  return enemies;
}

/**
 * Boss sizing: run deterministic Monte-Carlo playouts of a typical-player
 * model over the layout and return the final count at the target lose-rate
 * quantile. A player must beat the boss strictly, so the fraction of playouts
 * at or below the returned value is the modeled lose rate.
 *
 * The player model mirrors the PLANNING bot in scripts/bot.ts: noisy
 * log-scale comparison of gate outcomes with a small multiplier bias, a
 * one-row-deeper re-read when the outcomes look close (the next row is
 * rendered ahead, so a typical player uses it), occasional outright
 * blunders, and a fixed chance of eating each enemy clump. Calibrating to a
 * planning player is deliberate: it is what makes greedy one-row play lose
 * ground on trap rows.
 */
function bossFromPlayouts(
  seed: number,
  gatePairs: GatePairDef[],
  enemies: EnemyClumpDef[],
  startCount: number,
  loseRate: number
): number {
  const L = CONFIG.levels;
  const rng = mulberry32(seed * 31 + 7);
  const events: { z: number; gate?: GatePairDef; gateIndex: number; enemy?: EnemyClumpDef }[] = [
    ...gatePairs.map((g, i) => ({ z: g.z, gate: g, gateIndex: i })),
    ...enemies.map((e) => ({ z: e.z, enemy: e, gateIndex: -1 })),
  ].sort((a, b) => a.z - b.z);
  // For each enemy event, the index of the next gate down the lane (the
  // player runs toward that gate's chosen half when the clump arrives).
  let upcoming = gatePairs.length;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].gate) {
      upcoming = events[i].gateIndex;
    } else {
      events[i].gateIndex = upcoming;
    }
  }

  const finals: number[] = [];
  const sides = new Array<number>(gatePairs.length);
  for (let k = 0; k < L.playoutCount; k++) {
    let c = startCount;
    sides.fill(0);
    // Perceived log-size of an outcome, with the multiplier flash bias.
    const seen = (value: number, mulCount: number): number =>
      Math.log(Math.max(1, value)) +
      mulCount * Math.log(L.typicalMulBias) +
      gaussian(rng) * L.typicalSigma;
    // Decide a gate's side with the noisy planning model, at most once per
    // run: one-row read first, close calls re-scored through the next row.
    const decide = (i: number, count: number): number => {
      if (sides[i] === 0) {
        const gate = gatePairs[i];
        const seenLeft = seen(applyOp(count, gate.left), gate.left.kind === 'mul' ? 1 : 0);
        const seenRight = seen(applyOp(count, gate.right), gate.right.kind === 'mul' ? 1 : 0);
        let side = seenLeft >= seenRight ? -1 : 1;
        const next = gatePairs[i + 1];
        const close =
          Math.abs(seenLeft - seenRight) < Math.log(L.typicalPlanCloseRatio);
        if (next && close) {
          // Close call: the player works the visible numbers — the exact
          // best two-step outcome through the next row decides.
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
        if (rng() < L.typicalBlunderChance) {
          side = -side;
        }
        sides[i] = side;
      }
      return sides[i];
    };
    for (const ev of events) {
      if (c <= 0) {
        break;
      }
      if (ev.gate) {
        const side = decide(ev.gateIndex, c);
        c = applyOp(c, side < 0 ? ev.gate.left : ev.gate.right);
      } else if (ev.enemy) {
        // Path when the clump arrives: aimed at the next gate's chosen half,
        // or the lane centre after the last gate.
        const aim =
          ev.gateIndex < gatePairs.length ? decide(ev.gateIndex, c) * L.typicalAimX : 0;
        const collides = Math.abs(aim - ev.enemy.x) < CONFIG.enemies.hitWindowX;
        if (collides && rng() < L.typicalDodgeFailChance) {
          c = Math.max(0, c - ev.enemy.count);
        }
      }
    }
    finals.push(c);
  }
  finals.sort((a, b) => a - b);
  // Allow loseRate * N playouts to lose: the boss sits one unit below the
  // final count at that rank, so everything from the rank up strictly beats
  // it. (Minus one matters: final counts are discrete with heavy atoms — a
  // boss placed ON an atom would drag the whole atom into the losing side.)
  const idx = Math.min(finals.length - 1, Math.max(0, Math.floor(loseRate * finals.length)));
  return finals[idx] - 1;
}

function gaussian(rng: Rng): number {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Round gameplay numbers to friendlier values without changing magnitude much. */
function niceValue(v: number): number {
  const r = Math.round(v);
  if (r >= 100) {
    return Math.round(r / 10) * 10;
  }
  if (r >= 20) {
    return Math.round(r / 5) * 5;
  }
  return Math.max(1, r);
}

// Convenience for scripts/tools: the greedy-optimal final count of a level
// (best gate at every pair, all enemies dodged).
export function optimalFinalCount(level: LevelDef): number {
  let c = level.startCount;
  for (const pair of level.gatePairs) {
    c = Math.max(applyOp(c, pair.left), applyOp(c, pair.right));
  }
  return c;
}
