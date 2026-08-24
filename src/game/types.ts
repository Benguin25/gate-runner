export type GateOpKind = 'add' | 'sub' | 'mul' | 'div';

export interface GateOp {
  kind: GateOpKind;
  value: number;
}

/**
 * The gamble gate: 50/50 xN or ÷N, rolled by the sim on contact from the
 * per-attempt seeded RNG. Only ever appears as the middle option of a trio.
 */
export interface GambleOp {
  kind: 'gamble';
  value: number;
}

export interface GatePairDef {
  /** World-z of the gate wall. */
  z: number;
  left: GateOp;
  right: GateOp;
  /** Optional middle gamble gate; the row becomes a trio of thirds. */
  middle?: GambleOp;
}

export interface EnemyClumpDef {
  /** World-z of the clump. */
  z: number;
  /** Normalized lane-x in [-1, 1]. */
  x: number;
  /** Number of enemies; contact costs the crowd this many units. */
  count: number;
}

export interface LevelDef {
  /** Seed the generator will use; the hardcoded level fixes it at 1. */
  seed: number;
  startCount: number;
  gatePairs: GatePairDef[];
  enemies: EnemyClumpDef[];
  boss: { z: number; count: number };
}

export type SimPhase = 'running' | 'boss' | 'won' | 'lost';

/**
 * One-shot moments the sim announces for juice (sound, haptics, particles).
 * Queued on SimState.events; interactive callers drain the queue every frame,
 * headless callers (bot, boss playouts) can ignore it — it is length-capped.
 */
export type SimEventKind =
  | 'gateGood'
  | 'gateBad'
  | 'gambleWin'
  | 'gambleLose'
  | 'enemyHit'
  | 'bossHit'
  | 'drained'
  | 'won'
  | 'lost';

export interface SimEvent {
  kind: SimEventKind;
}

export interface GateState extends GatePairDef {
  used: boolean;
  /** Meaningful once used: -1 = left hit, 1 = right hit, 0 = middle hit. */
  hitSide: -1 | 0 | 1;
  /** Seconds of hit flash remaining. */
  flash: number;
}

export interface EnemyState extends EnemyClumpDef {
  alive: boolean;
}

/** A rendered unit's current offset (px) from the crowd centre. */
export interface UnitVis {
  x: number;
  y: number;
}

export interface SimState {
  phase: SimPhase;
  time: number;
  /** The crowd count. Single source of truth; rendered units are visual only. */
  count: number;
  distance: number;
  prevDistance: number;
  crowdX: number;
  prevCrowdX: number;
  /** Steering target, normalized lane-x. */
  targetX: number;
  gates: GateState[];
  enemies: EnemyState[];
  boss: { z: number; count: number; knockT: number };
  /** Boss-fight multiplier per unit (strength upgrade). */
  unitStrength: number;
  /**
   * Seeded per level attempt; resolves gamble gates. Deterministic given the
   * attempt seed, so headless runs (bot) reproduce exactly.
   */
  gambleRng: () => number;
  drainAcc: number;
  units: UnitVis[];
  unitsActive: number;
  /** Queued juice events since the caller last cleared the array. */
  events: SimEvent[];
}
