export type GateOpKind = 'add' | 'sub' | 'mul' | 'div';

export interface GateOp {
  kind: GateOpKind;
  value: number;
}

export interface GatePairDef {
  /** World-z of the gate wall. */
  z: number;
  left: GateOp;
  right: GateOp;
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

export interface GateState extends GatePairDef {
  used: boolean;
  /** -1 = left hit, 1 = right hit, 0 = not hit. */
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
  drainAcc: number;
  units: UnitVis[];
  unitsActive: number;
}
