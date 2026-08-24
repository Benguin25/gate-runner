import type { SkCanvas } from '@shopify/react-native-skia';
import { Skia } from '@shopify/react-native-skia';
import { CONFIG } from '../game/config';
import { hash01, lerp } from '../engine/utils';
import { isCulled, projectDepth } from '../engine/projection';
import type { RenderCache } from './cache';

// The park backdrop: sky gradient with drifting clouds, grass sides with
// scattered flowers and pebbles, a pond strip with bobbing lilypads, and the
// warm sand path with speckle texture and edge highlights. Everything ground-
// level is anchored to world z so it scrolls with the lane; decoration
// placement hashes the world slot index so it is stable frame to frame.

/** Sky band above the horizon; drawn before the screen-shake transform. */
export function drawSky(
  canvas: SkCanvas,
  w: number,
  h: number,
  time: number,
  cache: RenderCache
): void {
  const V = CONFIG.visual;
  const horizonY = h * CONFIG.lane.horizonYFrac;
  canvas.drawRect(Skia.XYWHRect(0, 0, w, horizonY), cache.skyPaint(w, h));

  // Clouds: simple wide lozenges drifting and wrapping across the band.
  const cloud = cache.paint('cloud');
  cloud.setAlphaf(V.cloudAlpha);
  for (let i = 0; i < V.cloudCount; i++) {
    const cw = lerp(V.cloudMinWidthPx, V.cloudMaxWidthPx, hash01(i * 7 + 1));
    const ch = cw * V.cloudHeightFrac;
    const speed = lerp(V.cloudSpeedMinPx, V.cloudSpeedMaxPx, hash01(i * 7 + 2));
    const span = w + cw * 2;
    const x = ((hash01(i * 7 + 3) * span + time * speed) % span) - cw;
    const y = h * lerp(V.cloudBandTopFrac, V.cloudBandBottomFrac, hash01(i * 7 + 4));
    canvas.drawRRect(
      Skia.RRectXY(Skia.XYWHRect(x - cw / 2, y - ch / 2, cw, ch), ch / 2, ch / 2),
      cloud
    );
  }
  cloud.setAlphaf(1);
}

/** Everything at ground level; drawn inside the screen-shake transform. */
export function drawGround(
  canvas: SkCanvas,
  w: number,
  h: number,
  dist: number,
  time: number,
  cache: RenderCache
): void {
  const V = CONFIG.visual;
  const lane = cache.laneGeometry(w, h);

  // Painter's order: grass under everything, pond over grass, sand path over
  // both (it covers the pond's lower stretch near the camera).
  canvas.drawRect(lane.grassRect, cache.paint('grass'));
  canvas.drawPath(lane.pond, cache.paint('pond'));
  drawLilypads(canvas, w, h, dist, time, cache);

  canvas.drawPath(lane.surface, cache.paint('lane'));
  canvas.drawPath(lane.leftEdge, cache.edgePaint);
  canvas.drawPath(lane.rightEdge, cache.edgePaint);

  // Soft light highlight just inside each path edge.
  const highlight = cache.strokePaint('laneHighlight');
  highlight.setStrokeWidth(V.edgeHighlightWidthPx);
  highlight.setAlphaf(V.edgeHighlightAlpha);
  canvas.drawPath(lane.leftHighlight, highlight);
  canvas.drawPath(lane.rightHighlight, highlight);
  highlight.setAlphaf(1);

  drawSpeckles(canvas, w, h, dist, cache);
  drawStripes(canvas, w, h, dist, cache);
  drawSideDecor(canvas, w, h, dist, cache);
  drawMotes(canvas, w, h, dist, time, cache);
}

/** Cross-lane stripes scrolling toward the camera for a sense of speed. */
function drawStripes(
  canvas: SkCanvas,
  w: number,
  h: number,
  dist: number,
  cache: RenderCache
): void {
  const L = CONFIG.lane;
  const stripe = cache.paint('stripe');
  const firstStripeZ = Math.floor(dist / L.stripeSpacing) * L.stripeSpacing;
  for (let k = 0; k < 16; k++) {
    const dz = firstStripeZ + k * L.stripeSpacing - dist;
    if (isCulled(dz)) {
      continue;
    }
    const proj = projectDepth(dz, w, h);
    stripe.setAlphaf(L.stripeAlpha * (1 - Math.max(0, proj.p)));
    canvas.drawRect(
      Skia.XYWHRect(w / 2 - proj.halfW, proj.y - 1, proj.halfW * 2, 2),
      stripe
    );
  }
  stripe.setAlphaf(1);
}

/** Subtle darker speckle rows on the sand, anchored to world z. */
function drawSpeckles(
  canvas: SkCanvas,
  w: number,
  h: number,
  dist: number,
  cache: RenderCache
): void {
  const V = CONFIG.visual;
  const speckle = cache.paint('laneSpeckle');
  speckle.setAlphaf(V.speckleAlpha);
  const firstZ = Math.floor(dist / V.speckleSpacingZ) * V.speckleSpacingZ;
  for (let k = 0; k < V.speckleRows; k++) {
    const z = firstZ + k * V.speckleSpacingZ;
    const dz = z - dist;
    if (dz < 0 || isCulled(dz)) {
      continue;
    }
    const proj = projectDepth(dz, w, h);
    const n = Math.round(z / V.speckleSpacingZ);
    for (let j = 0; j < V.specklePerRow; j++) {
      const hx = hash01(n * 101 + j * 17);
      const hy = hash01(n * 101 + j * 17 + 1);
      const x = w / 2 + (hx * 2 - 1) * proj.halfW * 0.9;
      const y = proj.y + (hy - 0.5) * 8 * proj.scale;
      canvas.drawCircle(x, y, V.speckleRadiusPx * proj.scale, speckle);
    }
  }
  speckle.setAlphaf(1);
}

/** Flowers and pebbles scattered on the grass just outside each lane edge. */
function drawSideDecor(
  canvas: SkCanvas,
  w: number,
  h: number,
  dist: number,
  cache: RenderCache
): void {
  const V = CONFIG.visual;
  const firstZ = Math.floor(dist / V.decorSpacingZ) * V.decorSpacingZ;
  for (let k = 0; k < V.decorCount; k++) {
    const z = firstZ + k * V.decorSpacingZ;
    const dz = z - dist;
    if (dz < 0.5 || isCulled(dz)) {
      continue;
    }
    const proj = projectDepth(dz, w, h);
    if (proj.p > 0.88) {
      // Sub-pixel by here; the grass colour carries it.
      continue;
    }
    const n = Math.round(z / V.decorSpacingZ);
    for (let side = -1; side <= 1; side += 2) {
      const ha = hash01(n * 29 + side * 7);
      const hb = hash01(n * 29 + side * 7 + 3);
      const off = (V.decorMarginPx + ha * V.decorBeltPx) * proj.scale;
      const x = w / 2 + side * (proj.halfW + off);
      if (x < -8 || x > w + 8) {
        continue;
      }
      if (hb < V.flowerChance) {
        const r = V.flowerRadiusPx * proj.scale;
        canvas.drawCircle(x, proj.y, r, cache.paint(ha > 0.5 ? 'flowerPink' : 'flowerWhite'));
        canvas.drawCircle(x, proj.y, r * V.flowerCenterFrac, cache.paint('flowerCenter'));
      } else {
        canvas.drawCircle(x, proj.y, V.pebbleRadiusPx * proj.scale, cache.paint('pebble'));
      }
    }
  }
}

/** Lilypads in the pond sliver, scrolling with the lane and gently bobbing. */
function drawLilypads(
  canvas: SkCanvas,
  w: number,
  h: number,
  dist: number,
  time: number,
  cache: RenderCache
): void {
  const V = CONFIG.visual;
  const horizonY = h * CONFIG.lane.horizonYFrac;
  const pad = cache.paint('lilypad');
  const firstZ = Math.floor(dist / V.lilypadSpacingZ) * V.lilypadSpacingZ;
  for (let k = 0; k < V.lilypadCount; k++) {
    const z = firstZ + k * V.lilypadSpacingZ;
    const dz = z - dist;
    if (dz < 0 || isCulled(dz)) {
      continue;
    }
    const proj = projectDepth(dz, w, h);
    // Visible pond width at this row: the pond quad's right edge, clipped by
    // the lane's left edge (the sand path draws over the pond).
    const s = (h - proj.y) / (h - horizonY);
    const pondRight = w * lerp(V.pondBottomWidthFrac, V.pondTopWidthFrac, s);
    const visible = Math.min(pondRight, w / 2 - proj.halfW);
    if (visible < V.lilypadMinPondPx) {
      continue;
    }
    const n = Math.round(z / V.lilypadSpacingZ);
    const x = visible * lerp(0.25, 0.75, hash01(n * 13 + 5));
    const bob = Math.sin(time * Math.PI * 2 * V.lilypadBobHz + n * 1.9) * V.lilypadBobPx;
    const y = proj.y + bob * proj.scale;
    const rx = V.lilypadRadiusPx * proj.scale;
    const ry = rx * V.lilypadFlatten;
    canvas.drawOval(Skia.XYWHRect(x - rx, y - ry, rx * 2, ry * 2), pad);
    // Notch wedge in pond colour so the pad reads as a lilypad, not a dot.
    const notch = cache.scratchPath();
    notch.moveTo(x, y);
    notch.lineTo(x + rx * 1.05, y - ry * 0.6);
    notch.lineTo(x + rx * 1.05, y + ry * 0.25);
    notch.close();
    canvas.drawPath(notch, cache.paint('pond'));
  }
}

/** Dust motes drifting along the lane edges. */
function drawMotes(
  canvas: SkCanvas,
  w: number,
  h: number,
  dist: number,
  time: number,
  cache: RenderCache
): void {
  const V = CONFIG.visual;
  const mote = cache.paint('dust');
  for (let i = 0; i < V.moteCount; i++) {
    const range = V.moteRangeZ;
    let dz = (hash01(i * 53 + 11) * range - dist) % range;
    if (dz < 0) {
      dz += range;
    }
    const proj = projectDepth(dz, w, h);
    const side = i & 1 ? 1 : -1;
    const x = w / 2 + side * (proj.halfW - V.moteEdgeInsetPx * proj.scale);
    const bob = Math.sin(time * Math.PI * 2 * V.moteBobHz + i * 1.7) * V.moteBobPx;
    const y = proj.y - (6 + bob) * proj.scale;
    // Fade in and out over the scroll cycle so motes never pop.
    mote.setAlphaf(V.moteAlpha * Math.sin((dz / range) * Math.PI));
    canvas.drawCircle(x, y, V.moteRadiusPx * proj.scale, mote);
  }
  mote.setAlphaf(1);
}
