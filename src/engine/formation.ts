import { CONFIG } from '../game/config';
import { hash01 } from './utils';

// Sunflower / phyllotaxis layout: organic-looking blob, deterministic per
// index. Each slot is nudged by a stable per-index jitter (a bounded fraction
// of the spacing, so neighbours can't collide) — pure phyllotaxis rings read
// as neat rows once the blob is flattened for the fake perspective.

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function rawSlotX(i: number): number {
  const jx = (hash01(i * 11 + 5) - 0.5) * 2 * CONFIG.crowd.slotJitterFrac;
  return Math.cos(i * GOLDEN_ANGLE) * Math.sqrt(i + 0.5) + jx;
}

function rawSlotY(i: number): number {
  const jy = (hash01(i * 11 + 6) - 0.5) * 2 * CONFIG.crowd.slotJitterFrac;
  return (Math.sin(i * GOLDEN_ANGLE) * Math.sqrt(i + 0.5) + jy) * CONFIG.crowd.ellipseFlatten;
}

// Slots up to the render cap are precomputed at unit spacing: slot lookups run
// per unit per fixed step (and again for enemy clumps in the render), so the
// cos/sin/sqrt per call showed up in the 300-unit profile.
const TABLE_SIZE = CONFIG.crowd.renderCap;
const tableX = new Float32Array(TABLE_SIZE);
const tableY = new Float32Array(TABLE_SIZE);
for (let i = 0; i < TABLE_SIZE; i++) {
  tableX[i] = rawSlotX(i);
  tableY[i] = rawSlotY(i);
}

export function slotX(i: number, spacingPx: number): number {
  return (i < TABLE_SIZE ? tableX[i] : rawSlotX(i)) * spacingPx;
}

export function slotY(i: number, spacingPx: number): number {
  return (i < TABLE_SIZE ? tableY[i] : rawSlotY(i)) * spacingPx;
}

/** Radius (px, before blob scaling) of a blob with `rendered` units. */
export function blobRadiusPx(rendered: number, spacingPx: number): number {
  return spacingPx * Math.sqrt(rendered) + CONFIG.crowd.unitRadiusPx;
}

/** Above the render cap the whole blob scales up instead of adding sprites. */
export function blobScale(count: number): number {
  const cap = CONFIG.crowd.renderCap;
  return count <= cap ? 1 : Math.sqrt(count / cap);
}
