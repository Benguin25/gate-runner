import type { LevelDef } from './types';

// Levels are meant to be generated deterministically from a seed (milestone 4).
// For now getLevel returns a single hardcoded level shaped exactly like the
// generator's future output, so the generator can slot in behind this function
// without touching any callers.

const LEVEL_1: LevelDef = {
  seed: 1,
  startCount: 10,
  // Gate pairs use all four operators. Greedy play from 10 units:
  // +5 → 15, x2 → 30, -4 → 26, +10 → 36, x2 → 72 (minus any enemy contact).
  gatePairs: [
    { z: 14, left: { kind: 'add', value: 5 }, right: { kind: 'sub', value: 3 } },
    { z: 30, left: { kind: 'div', value: 2 }, right: { kind: 'mul', value: 2 } },
    { z: 46, left: { kind: 'sub', value: 4 }, right: { kind: 'div', value: 2 } },
    { z: 62, left: { kind: 'add', value: 10 }, right: { kind: 'sub', value: 8 } },
    { z: 78, left: { kind: 'mul', value: 2 }, right: { kind: 'add', value: 6 } },
  ],
  enemies: [
    { z: 22, x: -0.45, count: 3 },
    { z: 54, x: 0.4, count: 5 },
    { z: 70, x: 0.0, count: 6 },
  ],
  boss: { z: 94, count: 45 },
};

export function getLevel(levelNumber: number): LevelDef {
  'worklet';
  // TODO(milestone 4): deterministic generation from levelNumber-derived seed.
  return LEVEL_1;
}
