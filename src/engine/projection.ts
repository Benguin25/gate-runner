import { CONFIG } from '../game/config';
import { lerp } from './utils';

// Fake perspective for a portrait lane: the camera sits slightly behind the
// crowd, the lane narrows toward the horizon and sprites scale with depth.
// dz is world distance ahead of the crowd row; p = dz / (dz + depth) maps it
// to [0, 1) between the crowd row and the horizon (slightly negative behind).

export interface Projected {
  /** Projected fraction toward the horizon; used for culling. */
  p: number;
  /** Screen y of the lane row at this depth. */
  y: number;
  /** Sprite scale at this depth (1 at the crowd row). */
  scale: number;
  /** Lane half-width in px at this depth. */
  halfW: number;
}

export function projectDepth(dz: number, w: number, h: number): Projected {
  'worklet';
  const L = CONFIG.lane;
  const p = dz / (dz + L.perspectiveDepth);
  const y = lerp(h * L.crowdYFrac, h * L.horizonYFrac, p);
  const scale = 1 - p * (1 - L.minScale);
  const halfW = w * lerp(L.bottomHalfWidthFrac, L.topHalfWidthFrac, p);
  return { p, y, scale, halfW };
}

export function isCulled(dz: number): boolean {
  'worklet';
  const L = CONFIG.lane;
  if (dz < L.cullBehind) {
    return true;
  }
  return dz / (dz + L.perspectiveDepth) > L.cullFar;
}
