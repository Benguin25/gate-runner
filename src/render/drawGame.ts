import {
  PaintStyle,
  Skia,
  type SkCanvas,
  type SkFont,
  type SkPaint,
} from '@shopify/react-native-skia';
import { CONFIG } from '../game/config';
import { isGoodOp, opLabel } from '../game/ops';
import type { SimState } from '../game/types';
import { blobRadiusPx, blobScale, slotX, slotY } from '../engine/formation';
import { projectDepth, isCulled } from '../engine/projection';
import { clamp, lerp } from '../engine/utils';
import type { GameFonts } from './fonts';

// Everything is drawn procedurally with Skia — no image assets. Runs as a
// worklet on the UI thread inside GameCanvas's picture recording.

export function drawGame(
  canvas: SkCanvas,
  s: SimState,
  w: number,
  h: number,
  alpha: number,
  fonts: GameFonts
): void {
  'worklet';
  const C = CONFIG.colors;
  const cx = w / 2;
  // Interpolate scroll and steering between fixed steps for a smooth render.
  const dist = lerp(s.prevDistance, s.distance, alpha);
  const crowdX = lerp(s.prevCrowdX, s.crowdX, alpha);
  const paint = Skia.Paint();

  paint.setColor(Skia.Color(C.bg));
  canvas.drawRect(Skia.XYWHRect(0, 0, w, h), paint);

  drawLane(canvas, w, h, dist, paint);
  drawGates(canvas, s, w, h, cx, dist, paint, fonts.gate);
  drawEnemies(canvas, s, w, h, cx, dist, paint, fonts.small);
  drawBoss(canvas, s, w, h, cx, dist, paint, fonts.boss);
  drawCrowd(canvas, s, w, h, cx, crowdX, paint, fonts.label);
}

function drawLane(canvas: SkCanvas, w: number, h: number, dist: number, paint: SkPaint): void {
  'worklet';
  const L = CONFIG.lane;
  const C = CONFIG.colors;
  const cx = w / 2;
  const horizonY = h * L.horizonYFrac;
  // Extend the lane past the crowd row to the bottom of the screen by
  // inverting the projection at y = h.
  const pBottom = (h - h * L.crowdYFrac) / (horizonY - h * L.crowdYFrac);
  const halfBottom = w * lerp(L.bottomHalfWidthFrac, L.topHalfWidthFrac, pBottom);
  const halfTop = w * L.topHalfWidthFrac;

  const lane = Skia.Path.Make();
  lane.moveTo(cx - halfBottom, h);
  lane.lineTo(cx + halfBottom, h);
  lane.lineTo(cx + halfTop, horizonY);
  lane.lineTo(cx - halfTop, horizonY);
  lane.close();
  paint.setColor(Skia.Color(C.lane));
  paint.setAlphaf(1);
  canvas.drawPath(lane, paint);

  // Edge lines.
  const edge = Skia.Paint();
  edge.setColor(Skia.Color(C.laneEdge));
  edge.setStyle(PaintStyle.Stroke);
  edge.setStrokeWidth(3);
  const leftEdge = Skia.Path.Make();
  leftEdge.moveTo(cx - halfBottom, h);
  leftEdge.lineTo(cx - halfTop, horizonY);
  canvas.drawPath(leftEdge, edge);
  const rightEdge = Skia.Path.Make();
  rightEdge.moveTo(cx + halfBottom, h);
  rightEdge.lineTo(cx + halfTop, horizonY);
  canvas.drawPath(rightEdge, edge);

  // Cross-lane stripes scrolling toward the camera for a sense of speed.
  const firstStripeZ = Math.floor(dist / L.stripeSpacing) * L.stripeSpacing;
  for (let k = 0; k < 16; k++) {
    const dz = firstStripeZ + k * L.stripeSpacing - dist;
    if (isCulled(dz)) {
      continue;
    }
    const proj = projectDepth(dz, w, h);
    paint.setColor(Skia.Color(C.stripe));
    paint.setAlphaf(L.stripeAlpha * (1 - Math.max(0, proj.p)));
    canvas.drawRect(
      Skia.XYWHRect(w / 2 - proj.halfW, proj.y - 1, proj.halfW * 2, 2),
      paint
    );
  }
  paint.setAlphaf(1);
}

function drawGates(
  canvas: SkCanvas,
  s: SimState,
  w: number,
  h: number,
  cx: number,
  dist: number,
  paint: SkPaint,
  font: SkFont
): void {
  'worklet';
  const G = CONFIG.gates;
  const C = CONFIG.colors;
  // Far to near, so closer walls draw on top.
  for (let i = s.gates.length - 1; i >= 0; i--) {
    const gate = s.gates[i];
    const dz = gate.z - dist;
    if (isCulled(dz)) {
      continue;
    }
    const proj = projectDepth(dz, w, h);
    const wallH = G.heightPx * proj.scale;
    const r = G.cornerRadiusPx * proj.scale;

    for (let side = -1; side <= 1; side += 2) {
      const op = side < 0 ? gate.left : gate.right;
      const x0 = side < 0 ? cx - proj.halfW : cx;
      let a: number = gate.used ? G.passedOpacity : G.opacity;
      if (gate.used && gate.hitSide === side && gate.flash > 0) {
        // The chosen gate flashes bright as the number pops.
        a = lerp(G.passedOpacity, 1, gate.flash / G.hitFlashSec);
      }
      paint.setColor(Skia.Color(isGoodOp(op) ? C.goodGate : C.badGate));
      paint.setAlphaf(a);
      canvas.drawRRect(
        Skia.RRectXY(Skia.XYWHRect(x0, proj.y - wallH, proj.halfW, wallH), r, r),
        paint
      );

      paint.setColor(Skia.Color(C.gateText));
      paint.setAlphaf(clamp(a + 0.25, 0, 1));
      canvas.save();
      canvas.translate(x0 + proj.halfW / 2, proj.y - wallH / 2);
      canvas.scale(proj.scale, proj.scale);
      drawCenteredText(canvas, opLabel(op), 0, G.textFontSize * 0.36, font, paint);
      canvas.restore();
    }
  }
  paint.setAlphaf(1);
}

function drawEnemies(
  canvas: SkCanvas,
  s: SimState,
  w: number,
  h: number,
  cx: number,
  dist: number,
  paint: SkPaint,
  font: SkFont
): void {
  'worklet';
  const E = CONFIG.enemies;
  const C = CONFIG.colors;
  for (let i = s.enemies.length - 1; i >= 0; i--) {
    const e = s.enemies[i];
    const dz = e.z - dist;
    if (!e.alive || isCulled(dz)) {
      continue;
    }
    const proj = projectDepth(dz, w, h);
    const ex = cx + e.x * proj.halfW;
    const n = Math.min(e.count, E.renderCap);
    const r = E.unitRadiusPx * proj.scale;
    for (let j = 0; j < n; j++) {
      const px = ex + slotX(j, E.slotSpacingPx) * proj.scale;
      const py = proj.y + slotY(j, E.slotSpacingPx) * proj.scale;
      paint.setColor(Skia.Color(C.enemy));
      canvas.drawCircle(px, py, r, paint);
      paint.setColor(Skia.Color(C.enemyHead));
      canvas.drawCircle(px, py - r * 0.9, r * CONFIG.crowd.headRadiusFrac, paint);
    }
    const clumpR = blobRadiusPx(n, E.slotSpacingPx) * proj.scale;
    paint.setColor(Skia.Color(C.label));
    canvas.save();
    canvas.translate(ex, proj.y - clumpR - 6 * proj.scale);
    canvas.scale(proj.scale, proj.scale);
    drawCenteredText(canvas, `${e.count}`, 0, 0, font, paint);
    canvas.restore();
  }
}

function drawBoss(
  canvas: SkCanvas,
  s: SimState,
  w: number,
  h: number,
  cx: number,
  dist: number,
  paint: SkPaint,
  font: SkFont
): void {
  'worklet';
  const B = CONFIG.boss;
  const C = CONFIG.colors;
  const dz = s.boss.z - dist;
  if (isCulled(dz)) {
    return;
  }
  const proj = projectDepth(dz, w, h);
  const kt = s.boss.knockT;
  // Knockback tumble: up, off to the side, spinning.
  const ox = kt * w * 0.3;
  const oy = -kt * kt * h * 0.65;
  // Stomp bounce while grinding a losing crowd down.
  const losing = s.phase === 'boss' && s.count <= s.boss.count && s.count > 0;
  const bounce = losing ? Math.abs(Math.sin(s.time * 12)) * 8 : 0;

  canvas.save();
  canvas.translate(cx + ox, proj.y + oy - bounce);
  canvas.rotate(kt * 320, 0, 0);
  canvas.scale(proj.scale, proj.scale);

  const R = B.bodyRadiusPx;
  const hr = R * B.headRadiusFrac;
  paint.setColor(Skia.Color(C.boss));
  canvas.drawCircle(0, 0, R, paint);
  canvas.drawCircle(0, -R * 0.95, hr, paint);

  // Crown: base band plus three spikes.
  const crown = Skia.Path.Make();
  const baseY = -R * 0.95 - hr * 0.8;
  crown.addRect(Skia.XYWHRect(-hr * 0.7, baseY - hr * 0.2, hr * 1.4, hr * 0.25));
  for (let k = -1; k <= 1; k++) {
    const sx = k * hr * 0.47;
    crown.moveTo(sx - hr * 0.23, baseY - hr * 0.15);
    crown.lineTo(sx + hr * 0.23, baseY - hr * 0.15);
    crown.lineTo(sx, baseY - hr * 0.85);
    crown.close();
  }
  paint.setColor(Skia.Color(C.bossCrown));
  canvas.drawPath(crown, paint);

  // The number over the boss's head, until the tumble carries it away.
  if (kt < 0.2) {
    paint.setColor(Skia.Color(C.label));
    drawShadowedText(
      canvas,
      `${s.boss.count}`,
      0,
      baseY - hr - B.numberGapPx,
      font,
      paint
    );
  }
  canvas.restore();
}

function drawCrowd(
  canvas: SkCanvas,
  s: SimState,
  w: number,
  h: number,
  cx: number,
  crowdX: number,
  paint: SkPaint,
  font: SkFont
): void {
  'worklet';
  const K = CONFIG.crowd;
  const C = CONFIG.colors;
  const proj = projectDepth(0, w, h);
  const bs = blobScale(s.count);
  const sx = cx + crowdX * proj.halfW;
  const sy = proj.y;

  for (let i = s.unitsActive - 1; i >= 0; i--) {
    const u = s.units[i];
    const bob = Math.sin(s.time * K.bobFrequency + i * 1.31) * K.bobAmplitudePx;
    const px = sx + u.x * bs;
    const py = sy + u.y * bs + bob;
    const r = K.unitRadiusPx * bs;
    paint.setColor(Skia.Color(C.crowd));
    canvas.drawCircle(px, py, r, paint);
    paint.setColor(Skia.Color(C.crowdHead));
    canvas.drawCircle(px, py - r * 0.9, r * K.headRadiusFrac, paint);
  }

  if (s.count > 0) {
    const labelY =
      sy - blobRadiusPx(s.unitsActive, K.slotSpacingPx) * bs - K.labelGapPx;
    paint.setColor(Skia.Color(C.label));
    drawShadowedText(canvas, `${s.count}`, sx, labelY, font, paint);
  }
}

function drawCenteredText(
  canvas: SkCanvas,
  text: string,
  cx: number,
  baselineY: number,
  font: SkFont,
  paint: SkPaint
): void {
  'worklet';
  const width = font.measureText(text).width;
  canvas.drawText(text, cx - width / 2, baselineY, paint, font);
}

function drawShadowedText(
  canvas: SkCanvas,
  text: string,
  cx: number,
  baselineY: number,
  font: SkFont,
  paint: SkPaint
): void {
  'worklet';
  const shadow = Skia.Paint();
  shadow.setColor(Skia.Color(CONFIG.colors.labelShadow));
  shadow.setAlphaf(0.8);
  const width = font.measureText(text).width;
  canvas.drawText(text, cx - width / 2 + 2, baselineY + 3, shadow, font);
  canvas.drawText(text, cx - width / 2, baselineY, paint, font);
}
