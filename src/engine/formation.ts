import { CONFIG } from '../game/config';

// Sunflower / phyllotaxis layout: organic-looking blob, deterministic per index.

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

// Slots up to the render cap are precomputed at unit spacing: slot lookups run
// per unit per fixed step (and again for enemy clumps in the render), so the
// cos/sin/sqrt per call showed up in the 300-unit profile.
const TABLE_SIZE = CONFIG.crowd.renderCap;
const tableX = new Float32Array(TABLE_SIZE);
const tableY = new Float32Array(TABLE_SIZE);
for (let i = 0; i < TABLE_SIZE; i++) {
  const r = Math.sqrt(i + 0.5);
  tableX[i] = Math.cos(i * GOLDEN_ANGLE) * r;
  tableY[i] = Math.sin(i * GOLDEN_ANGLE) * r * CONFIG.crowd.ellipseFlatten;
}

export function slotX(i: number, spacingPx: number): number {
  if (i < TABLE_SIZE) {
    return tableX[i] * spacingPx;
  }
  return Math.cos(i * GOLDEN_ANGLE) * spacingPx * Math.sqrt(i + 0.5);
}

export function slotY(i: number, spacingPx: number): number {
  if (i < TABLE_SIZE) {
    return tableY[i] * spacingPx;
  }
  return (
    Math.sin(i * GOLDEN_ANGLE) *
    spacingPx *
    Math.sqrt(i + 0.5) *
    CONFIG.crowd.ellipseFlatten
  );
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
