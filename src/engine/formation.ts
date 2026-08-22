import { CONFIG } from '../game/config';

// Sunflower / phyllotaxis layout: organic-looking blob, deterministic per index.

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

export function slotX(i: number, spacingPx: number): number {
  'worklet';
  return Math.cos(i * GOLDEN_ANGLE) * spacingPx * Math.sqrt(i + 0.5);
}

export function slotY(i: number, spacingPx: number): number {
  'worklet';
  return (
    Math.sin(i * GOLDEN_ANGLE) *
    spacingPx *
    Math.sqrt(i + 0.5) *
    CONFIG.crowd.ellipseFlatten
  );
}

/** Radius (px, before blob scaling) of a blob with `rendered` units. */
export function blobRadiusPx(rendered: number, spacingPx: number): number {
  'worklet';
  return spacingPx * Math.sqrt(rendered) + CONFIG.crowd.unitRadiusPx;
}

/** Above the render cap the whole blob scales up instead of adding sprites. */
export function blobScale(count: number): number {
  'worklet';
  const cap = CONFIG.crowd.renderCap;
  return count <= cap ? 1 : Math.sqrt(count / cap);
}
