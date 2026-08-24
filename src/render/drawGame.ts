import type { SkCanvas, SkFont, SkPaint, SkPath } from '@shopify/react-native-skia';
import { ClipOp, Skia } from '@shopify/react-native-skia';
import { CONFIG } from '../game/config';
import { isGoodOp, opLabel } from '../game/ops';
import type { SimState } from '../game/types';
import { blobRadiusPx, blobScale, slotX, slotY } from '../engine/formation';
import { projectDepth, isCulled } from '../engine/projection';
import { clamp, hash01, lerp } from '../engine/utils';
import type { GameFonts } from './fonts';
import type { ColorName, RenderCache } from './cache';
import { drawGround, drawSky } from './environment';
import { ParticleKind, shakeOffset, type FxState } from './fx';

// Everything is drawn procedurally with Skia — no image assets. Called once
// per frame from GameCanvas's picture recording on the JS thread. Paints,
// colours and static lane geometry come from the RenderCache: at the 80-unit
// render cap this loop is the hot path, so it makes no per-frame Skia
// allocations beyond rects and no setColor calls with string colours. Drop
// shadows, outlines, bodies, beaks and eyes each batch into one shared path
// per group for the same reason.

export function drawGame(
  canvas: SkCanvas,
  s: SimState,
  fx: FxState,
  w: number,
  h: number,
  alpha: number,
  fonts: GameFonts,
  cache: RenderCache
): void {
  const cx = w / 2;
  // Interpolate scroll and steering between fixed steps for a smooth render.
  const dist = lerp(s.prevDistance, s.distance, alpha);
  const crowdX = lerp(s.prevCrowdX, s.crowdX, alpha);

  // The sky stays put; the boss-hit screen shake displaces the ground world.
  drawSky(canvas, w, h, s.time, cache);
  const shake = shakeOffset(fx);
  const shaken = shake.x !== 0 || shake.y !== 0;
  if (shaken) {
    canvas.save();
    canvas.translate(shake.x, shake.y);
  }

  drawGround(canvas, w, h, dist, s.time, cache);
  drawGates(canvas, s, w, h, cx, dist, cache, fonts.gate, fonts.small);
  drawEnemies(canvas, s, w, h, cx, dist, cache, fonts.small);
  drawBoss(canvas, s, w, h, cx, dist, cache, fonts.boss);
  drawCrowd(canvas, s, fx, w, h, cx, crowdX, cache, fonts.label);
  drawParticles(canvas, fx, cache);

  if (shaken) {
    canvas.restore();
  }

  // Bad-gate red flash covers the full screen and fades out.
  if (fx.flashT > 0) {
    const J = CONFIG.juice;
    const flash = cache.paint('badGate');
    flash.setAlphaf(J.redFlashAlpha * (fx.flashT / J.redFlashSec));
    canvas.drawRect(Skia.XYWHRect(0, 0, w, h), flash);
    flash.setAlphaf(1);
  }

  // Gamble-gate purple flash, same treatment.
  if (fx.gambleFlashT > 0) {
    const J = CONFIG.juice;
    const flash = cache.paint('gambleGate');
    flash.setAlphaf(J.gambleFlashAlpha * (fx.gambleFlashT / J.gambleFlashSec));
    canvas.drawRect(Skia.XYWHRect(0, 0, w, h), flash);
    flash.setAlphaf(1);
  }
}

function drawGates(
  canvas: SkCanvas,
  s: SimState,
  w: number,
  h: number,
  cx: number,
  dist: number,
  cache: RenderCache,
  font: SkFont,
  smallFont: SkFont
): void {
  const G = CONFIG.gates;
  const V = CONFIG.visual;
  // Lookahead: the current row draws normally, the row after it draws dimmed
  // (smaller with a readable text floor), and rows beyond that stay hidden —
  // the read is always exactly two rows deep.
  let currentIdx = s.gates.length;
  for (let i = 0; i < s.gates.length; i++) {
    if (!s.gates[i].used) {
      currentIdx = i;
      break;
    }
  }
  // Far to near, so closer walls draw on top.
  for (let i = s.gates.length - 1; i >= 0; i--) {
    const gate = s.gates[i];
    if (!gate.used && i > currentIdx + 1) {
      continue;
    }
    const dz = gate.z - dist;
    if (isCulled(dz)) {
      continue;
    }
    const proj = projectDepth(dz, w, h);
    const lookahead = !gate.used && i === currentIdx + 1;
    const dim = lookahead ? G.lookaheadAlphaFrac : 1;
    const textScale = lookahead
      ? Math.max(proj.scale, G.lookaheadTextMinScale)
      : proj.scale;
    const r = G.cornerRadiusPx * proj.scale;
    // A row with a middle gamble gate is a trio of thirds, otherwise halves.
    const cols = gate.middle ? 3 : 2;
    const colW = (proj.halfW * 2) / cols;

    // Faint shadow band the whole row casts on the path.
    const band = cache.paint('shadow');
    band.setAlphaf(V.gateShadowAlpha * dim * (gate.used ? 0.4 : 1));
    canvas.drawRect(
      Skia.XYWHRect(
        cx - proj.halfW,
        proj.y + proj.scale,
        proj.halfW * 2,
        V.gateShadowHeightPx * proj.scale
      ),
      band
    );
    band.setAlphaf(1);

    for (let c = 0; c < cols; c++) {
      const side = cols === 3 ? c - 1 : c === 0 ? -1 : 1;
      const gamble = cols === 3 && side === 0 ? gate.middle : undefined;
      const op = side < 0 ? gate.left : gate.right;
      const good = !gamble && isGoodOp(op);
      const x0 = cx - proj.halfW + c * colW;
      // Good gates pulse gently: the wall grows a touch and the glow swells.
      let pulse = 0;
      let wallH = G.heightPx * proj.scale;
      if (good && !gate.used) {
        pulse = 0.5 + 0.5 * Math.sin(s.time * Math.PI * 2 * V.goodPulseHz + gate.z);
        wallH += V.goodPulseGrowPx * proj.scale * pulse;
      }
      let a: number = (gate.used ? G.passedOpacity : G.opacity) * dim;
      if (gate.used && gate.hitSide === side && gate.flash > 0) {
        // The chosen gate flashes bright as the number pops.
        a = lerp(G.passedOpacity, 1, gate.flash / G.hitFlashSec);
      }
      // Decoration strength relative to a fresh wall, so stripes, glow and
      // sparkles dim in step with passed/lookahead walls.
      const deco = clamp(a / G.opacity, 0, 1);
      const rrect = Skia.RRectXY(Skia.XYWHRect(x0, proj.y - wallH, colW, wallH), r, r);
      const wall = cache.paint(gamble ? 'gambleGate' : good ? 'goodGate' : 'badGate');
      wall.setAlphaf(a);
      canvas.drawRRect(rrect, wall);
      wall.setAlphaf(1);

      // Slight 3D face: a darker strip along the bottom of the wall.
      const bevel = cache.paint('shadow');
      bevel.setAlphaf(V.bevelAlpha * deco);
      const bevelH = V.bevelHeightPx * proj.scale;
      canvas.drawRRect(
        Skia.RRectXY(Skia.XYWHRect(x0, proj.y - bevelH, colW, bevelH), r * 0.6, r * 0.6),
        bevel
      );
      bevel.setAlphaf(1);

      // Inner glow: a light stroke inset inside the face.
      const gi = V.glowInsetPx * proj.scale;
      if (wallH > gi * 3) {
        const glow = cache.strokePaint('gateOutline');
        glow.setStrokeWidth(V.glowWidthPx * proj.scale);
        glow.setAlphaf(
          V.glowAlpha * deco * (good && !gate.used ? 1 - V.goodPulseAmp * (1 - pulse) : 0.7)
        );
        canvas.drawRRect(
          Skia.RRectXY(
            Skia.XYWHRect(x0 + gi, proj.y - wallH + gi, colW - gi * 2, wallH - gi * 2),
            r * 0.7,
            r * 0.7
          ),
          glow
        );
        glow.setAlphaf(1);
      }

      if (!gamble && !good) {
        drawWarnStripes(canvas, cache, rrect, x0, colW, wallH, proj.y, proj.scale, deco);
      }
      if (gamble) {
        drawSparkles(canvas, cache, s.time, i, x0, colW, wallH, proj.y, proj.scale, deco);
      }

      drawGateFrame(canvas, cache, x0, colW, wallH, proj.y, proj.scale, a, c === 0);

      const fill: ColorName = gamble
        ? 'gambleGateText'
        : good
          ? 'goodGateText'
          : 'badGateText';
      const textA = clamp(a + 0.3, 0, 1);
      canvas.save();
      canvas.translate(x0 + colW / 2, proj.y - wallH / 2);
      canvas.scale(textScale, textScale);
      if (gamble) {
        // Both possible outcomes stacked: the gamble shows what it offers.
        const ow = V.gateOutlinePx * 0.7;
        drawChunkyText(canvas, `x${gamble.value}`, 0, -G.textFontSize * 0.1, smallFont, cache, fill, 'gateOutline', ow, textA);
        drawChunkyText(canvas, `÷${gamble.value}`, 0, G.textFontSize * 0.57, smallFont, cache, fill, 'gateOutline', ow, textA);
      } else {
        drawChunkyText(canvas, opLabel(op), 0, G.textFontSize * 0.36, font, cache, fill, 'gateOutline', V.gateOutlinePx, textA);
      }
      canvas.restore();
    }
  }
}

/** Low-opacity diagonal hazard stripes clipped inside a bad gate's wall. */
function drawWarnStripes(
  canvas: SkCanvas,
  cache: RenderCache,
  rrect: ReturnType<typeof Skia.RRectXY>,
  x0: number,
  colW: number,
  wallH: number,
  baseY: number,
  scale: number,
  deco: number
): void {
  const V = CONFIG.visual;
  canvas.save();
  canvas.clipRRect(rrect, ClipOp.Intersect, true);
  const stripes = cache.scratchPath();
  const period = (V.warnStripeWidthPx + V.warnStripeGapPx) * scale;
  const sw = V.warnStripeWidthPx * scale;
  const yT = baseY - wallH;
  for (let sx = x0 - wallH; sx < x0 + colW; sx += period) {
    stripes.moveTo(sx, baseY);
    stripes.lineTo(sx + sw, baseY);
    stripes.lineTo(sx + sw + wallH, yT);
    stripes.lineTo(sx + wallH, yT);
    stripes.close();
  }
  const warn = cache.paint('warnStripe');
  warn.setAlphaf(V.warnStripeAlpha * deco);
  canvas.drawPath(stripes, warn);
  warn.setAlphaf(1);
  canvas.restore();
}

/** Twinkling sparkle diamonds over the purple gamble wall. */
function drawSparkles(
  canvas: SkCanvas,
  cache: RenderCache,
  time: number,
  gateIdx: number,
  x0: number,
  colW: number,
  wallH: number,
  baseY: number,
  scale: number,
  deco: number
): void {
  const V = CONFIG.visual;
  const sp = cache.paint('sparkle');
  for (let j = 0; j < V.sparkleCount; j++) {
    const h1 = hash01(gateIdx * 97 + j * 31);
    const h2 = hash01(gateIdx * 97 + j * 31 + 1);
    const h3 = hash01(gateIdx * 97 + j * 31 + 2);
    const px = x0 + (0.12 + 0.76 * h1) * colW;
    const py = baseY - wallH * (0.12 + 0.76 * h2);
    const tw = 0.3 + 0.7 * Math.abs(Math.sin(time * Math.PI * 2 * V.sparkleHz + j * 2.1 + gateIdx));
    const size = lerp(V.sparkleMinPx, V.sparkleMaxPx, h3) * scale * (0.6 + 0.4 * tw);
    sp.setAlphaf(deco * tw);
    const d = cache.scratchPath();
    d.moveTo(px, py - size);
    d.lineTo(px + size * 0.38, py);
    d.lineTo(px, py + size);
    d.lineTo(px - size * 0.38, py);
    d.close();
    canvas.drawPath(d, sp);
  }
  sp.setAlphaf(1);
}

/** Gate frame: two posts and a crossbar over the wall, cartoon-outlined. */
function drawGateFrame(
  canvas: SkCanvas,
  cache: RenderCache,
  x0: number,
  colW: number,
  wallH: number,
  baseY: number,
  scale: number,
  wallAlpha: number,
  leftmost: boolean
): void {
  const V = CONFIG.visual;
  const postW = V.postWidthPx * scale;
  const rise = V.postRisePx * scale;
  const barH = V.crossbarHeightPx * scale;
  const topY = baseY - wallH - rise;
  const a = clamp(wallAlpha + 0.15, 0, 1);
  const leftPost = Skia.RRectXY(
    Skia.XYWHRect(x0 - postW / 2, topY, postW, wallH + rise),
    postW / 2,
    postW / 2
  );
  const rightPost = Skia.RRectXY(
    Skia.XYWHRect(x0 + colW - postW / 2, topY, postW, wallH + rise),
    postW / 2,
    postW / 2
  );
  const crossbar = Skia.RRectXY(
    Skia.XYWHRect(x0 - postW / 2, topY - barH, colW + postW, barH),
    barH / 2,
    barH / 2
  );
  const frame = cache.paint('gateFrame');
  frame.setAlphaf(a);
  // Adjacent walls share their boundary post; only draw the left post for
  // the leftmost wall so shared posts aren't double-painted.
  if (leftmost) {
    canvas.drawRRect(leftPost, frame);
  }
  canvas.drawRRect(rightPost, frame);
  canvas.drawRRect(crossbar, frame);
  frame.setAlphaf(1);
  // A thin shade line under the crossbar sells the slight 3D.
  const shade = cache.paint('gateFrameShade');
  shade.setAlphaf(0.5 * wallAlpha);
  canvas.drawRect(
    Skia.XYWHRect(x0 - postW / 2, topY, colW + postW, 1.5 * scale),
    shade
  );
  shade.setAlphaf(1);
  // Thick dark outline around the frame pieces.
  const outline = cache.strokePaint('outline');
  outline.setStrokeWidth(V.outlinePx * scale);
  outline.setAlphaf(a);
  if (leftmost) {
    canvas.drawRRect(leftPost, outline);
  }
  canvas.drawRRect(rightPost, outline);
  canvas.drawRRect(crossbar, outline);
  outline.setAlphaf(1);
}

function drawEnemies(
  canvas: SkCanvas,
  s: SimState,
  w: number,
  h: number,
  cx: number,
  dist: number,
  cache: RenderCache,
  font: SkFont
): void {
  const E = CONFIG.enemies;
  const V = CONFIG.visual;
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
    const ow = V.outlinePx * proj.scale;

    // Soft drop shadows first, batched into one flattened-circle path.
    drawShadowBatch(canvas, cache, (path, k) => {
      for (let j = 0; j < n; j++) {
        const px = ex + slotX(j, E.slotSpacingPx) * proj.scale;
        const py = proj.y + slotY(j, E.slotSpacingPx) * proj.scale;
        path.addCircle(px, (py + r * V.shadowDropFrac) / k, r * V.shadowWidthFrac);
      }
    });

    // Grumpy crabs: red body, big googly eyes, open pincers, all ringed by
    // the thick cartoon outline. Each part batches into one path per clump.
    const outlineP = cache.scratchPath(0);
    const clawP = cache.scratchPath(1);
    const notchP = cache.scratchPath(2);
    const bodyP = cache.scratchPath(3);
    const eyeP = cache.scratchPath(4);
    const pupilP = cache.scratchPath(5);
    for (let j = 0; j < n; j++) {
      const px = ex + slotX(j, E.slotSpacingPx) * proj.scale;
      const py = proj.y + slotY(j, E.slotSpacingPx) * proj.scale;
      const clawR = r * V.crabClawFrac;
      const clawY = py - r * V.crabClawUpFrac;
      const rw = r * V.crabBodyWidthFrac;
      const rh = r * V.crabBodyHeightFrac;
      const eyeR = r * V.crabEyeFrac;
      const eyeY = py - r * V.crabEyeUpFrac;
      const pupilR = r * V.crabPupilFrac;
      for (let side = -1; side <= 1; side += 2) {
        const clawX = px + side * r * V.crabClawOutFrac;
        outlineP.addCircle(clawX, clawY, clawR + ow);
        outlineP.addCircle(px + side * r * V.crabEyeOutFrac, eyeY, eyeR + ow);
        clawP.addCircle(clawX, clawY, clawR);
        // Open pincer: a V wedge cut into the claw's outer-top edge.
        notchP.moveTo(clawX, clawY);
        notchP.lineTo(clawX + side * clawR * 1.15, clawY - clawR * 0.85);
        notchP.lineTo(clawX + side * clawR * 1.25, clawY - clawR * 0.1);
        notchP.close();
        eyeP.addCircle(px + side * r * V.crabEyeOutFrac, eyeY, eyeR);
        // Pupils sit low and inward for the hostile glare.
        pupilP.addCircle(px + side * r * V.crabEyeOutFrac * 0.8, eyeY + eyeR * 0.3, pupilR);
      }
      outlineP.addOval(Skia.XYWHRect(px - rw - ow, py - rh - ow, (rw + ow) * 2, (rh + ow) * 2));
      bodyP.addOval(Skia.XYWHRect(px - rw, py - rh, rw * 2, rh * 2));
    }
    canvas.drawPath(outlineP, cache.paint('outline'));
    canvas.drawPath(clawP, cache.paint('crabClaw'));
    canvas.drawPath(notchP, cache.paint('outline'));
    canvas.drawPath(bodyP, cache.paint('enemy'));
    canvas.drawPath(eyeP, cache.paint('crabEye'));
    canvas.drawPath(pupilP, cache.paint('crabPupil'));

    // Count in a small red pill badge above the clump.
    const clumpR = blobRadiusPx(n, E.slotSpacingPx) * proj.scale;
    canvas.save();
    canvas.translate(ex, proj.y - clumpR - (V.pillHeightPx * 0.5 + 8) * proj.scale);
    canvas.scale(proj.scale, proj.scale);
    const text = `${e.count}`;
    const halfW = cache.textWidth(font, text) / 2 + V.pillPadXPx;
    const shadow = cache.paint('shadow');
    shadow.setAlphaf(0.3);
    canvas.drawRRect(
      Skia.RRectXY(
        Skia.XYWHRect(-halfW, -V.pillHeightPx / 2 + 2, halfW * 2, V.pillHeightPx),
        V.pillRadiusPx,
        V.pillRadiusPx
      ),
      shadow
    );
    shadow.setAlphaf(1);
    canvas.drawRRect(
      Skia.RRectXY(
        Skia.XYWHRect(-halfW, -V.pillHeightPx / 2, halfW * 2, V.pillHeightPx),
        V.pillRadiusPx,
        V.pillRadiusPx
      ),
      cache.paint('pill')
    );
    drawCenteredText(canvas, text, 0, E.labelFontSize * 0.36, font, cache.paint('label'), cache);
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
  cache: RenderCache,
  font: SkFont
): void {
  const B = CONFIG.boss;
  const V = CONFIG.visual;
  const dz = s.boss.z - dist;
  if (isCulled(dz)) {
    return;
  }
  const proj = projectDepth(dz, w, h);
  // knockT doubles as the win animation clock: the crab tips over backwards
  // and slides off toward the horizon.
  const kt = s.boss.knockT;
  const losing = s.phase === 'boss' && s.count <= s.boss.count && s.count > 0;
  const R = B.bodyRadiusPx;
  const ow = V.outlinePx;

  // Pincer snap: a quick pulse at the start of every snap period. While the
  // crowd is losing he snaps much faster.
  const period = losing ? B.snapLosePeriodSec : B.snapPeriodSec;
  const snapPhase = (s.time % period) / B.snapSec;
  const snap = snapPhase < 1 ? Math.sin(snapPhase * Math.PI) : 0;

  canvas.save();
  canvas.translate(cx, proj.y);
  canvas.scale(proj.scale, proj.scale);
  // Soft shadow pooling under the crab; fades as he tips off.
  if (kt < 0.6) {
    const shadow = cache.paint('shadow');
    shadow.setAlphaf(V.bossShadowAlpha * (1 - kt / 0.6));
    canvas.save();
    canvas.scale(1, 0.35);
    canvas.drawCircle(0, 0, R * V.bossShadowScale, shadow);
    canvas.restore();
    shadow.setAlphaf(1);
  }
  if (kt > 0) {
    // Win: tip over backwards (pivot at the ground row) and slide off.
    const ease = kt * kt;
    canvas.translate(0, -ease * R * B.slideOffFrac);
    canvas.rotate((-kt * B.tipRad * 180) / Math.PI, 0, 0);
  } else {
    // Idle menace: a slow rocking sway about the ground contact.
    canvas.rotate(
      (Math.sin(s.time * Math.PI * 2 * B.swayHz) * B.swayRad * 180) / Math.PI,
      0,
      0
    );
  }
  // Local origin at the body centre, lifted off the ground row.
  canvas.translate(0, -R * 0.55);

  const bw = R * B.bodyWidthFrac;
  const bh = R * B.bodyHeightFrac;
  const clawR = R * B.clawRadiusFrac;
  const clawUp = R * B.clawUpFrac + snap * R * B.snapLiftFrac;
  const clawOut = R * B.clawOutFrac - snap * R * 0.08;
  const shoulderR = R * B.shoulderRadiusFrac;
  const eyeR = R * B.eyeRadiusFrac;
  const pupilR = R * B.pupilFrac;

  // Thick dark outline under everything: one batched silhouette path.
  const outlineP = cache.scratchPath(0);
  for (let side = -1; side <= 1; side += 2) {
    outlineP.addCircle(side * clawOut, -clawUp, clawR + ow);
    outlineP.addCircle(side * R * B.shoulderOutFrac, -R * B.shoulderUpFrac, shoulderR + ow);
    outlineP.addCircle(side * R * B.eyeOutFrac, -R * B.eyeUpFrac, eyeR + ow);
  }
  outlineP.addOval(Skia.XYWHRect(-bw - ow, -bh - ow, (bw + ow) * 2, (bh + ow) * 2));
  canvas.drawPath(outlineP, cache.paint('outline'));

  // Shoulders and raised pincers, then the pincer notches (they close with a
  // snap: the wedge narrows to nothing at the snap peak).
  const bossClaw = cache.paint('bossClaw');
  const notchP = cache.scratchPath(1);
  const notch = 1 - 0.8 * snap;
  for (let side = -1; side <= 1; side += 2) {
    canvas.drawCircle(side * R * B.shoulderOutFrac, -R * B.shoulderUpFrac, shoulderR, bossClaw);
    canvas.drawCircle(side * clawOut, -clawUp, clawR, bossClaw);
    notchP.moveTo(side * clawOut, -clawUp);
    notchP.lineTo(side * (clawOut + clawR * 1.15), -clawUp - clawR * 0.85 * notch);
    notchP.lineTo(side * (clawOut + clawR * 1.25), -clawUp - clawR * 0.1);
    notchP.close();
  }
  canvas.drawPath(notchP, cache.paint('outline'));

  canvas.drawOval(Skia.XYWHRect(-bw, -bh, bw * 2, bh * 2), cache.paint('bossBody'));

  // Big googly eyes straddling the top of the shell, pupils glaring down.
  const eye = cache.paint('crabEye');
  const pupil = cache.paint('crabPupil');
  for (let side = -1; side <= 1; side += 2) {
    const ex = side * R * B.eyeOutFrac;
    const ey = -R * B.eyeUpFrac;
    canvas.drawCircle(ex, ey, eyeR, eye);
    canvas.drawCircle(ex - side * eyeR * 0.22, ey + eyeR * 0.28, pupilR, pupil);
  }

  // Angry brows slanting in over the eyes, and a grumpy frown.
  const stroke = cache.strokePaint('outline');
  stroke.setStrokeWidth(R * B.browStrokeFrac);
  for (let side = -1; side <= 1; side += 2) {
    canvas.drawLine(
      side * R * 0.16,
      -R * (B.eyeUpFrac + B.eyeRadiusFrac * 0.55),
      side * R * 0.68,
      -R * (B.eyeUpFrac + B.eyeRadiusFrac * 1.35),
      stroke
    );
  }
  stroke.setStrokeWidth(R * B.mouthStrokeFrac);
  const frown = cache.scratchPath(2);
  frown.moveTo(-R * 0.24, -R * 0.24);
  frown.lineTo(0, -R * 0.34);
  frown.lineTo(R * 0.24, -R * 0.24);
  canvas.drawPath(frown, stroke);

  canvas.restore();

  // The number over the crab — the biggest text on screen, in a big badge —
  // until he starts tipping.
  if (kt < 0.2) {
    canvas.save();
    canvas.translate(cx, proj.y - (R * B.badgeUpFrac + B.numberGapPx) * proj.scale);
    canvas.scale(proj.scale, proj.scale);
    const text = `${s.boss.count}`;
    const halfW = cache.textWidth(font, text) / 2 + V.badgePadXPx;
    const bh = V.badgeHeightPx;
    const badgeShadow = cache.paint('shadow');
    badgeShadow.setAlphaf(0.3);
    canvas.drawRRect(
      Skia.RRectXY(
        Skia.XYWHRect(-halfW, -bh / 2 + 3, halfW * 2, bh),
        V.badgeRadiusPx,
        V.badgeRadiusPx
      ),
      badgeShadow
    );
    badgeShadow.setAlphaf(1);
    canvas.drawRRect(
      Skia.RRectXY(
        Skia.XYWHRect(
          -halfW - V.badgeRimPx,
          -bh / 2 - V.badgeRimPx,
          (halfW + V.badgeRimPx) * 2,
          bh + V.badgeRimPx * 2
        ),
        V.badgeRadiusPx + V.badgeRimPx,
        V.badgeRadiusPx + V.badgeRimPx
      ),
      cache.paint('bossBadgeRim')
    );
    canvas.drawRRect(
      Skia.RRectXY(
        Skia.XYWHRect(-halfW, -bh / 2, halfW * 2, bh),
        V.badgeRadiusPx,
        V.badgeRadiusPx
      ),
      cache.paint('bossBadge')
    );
    drawShadowedText(canvas, text, 0, B.numberFontSize * 0.36, font, cache);
    canvas.restore();
  }
}

function drawCrowd(
  canvas: SkCanvas,
  s: SimState,
  fx: FxState,
  w: number,
  h: number,
  cx: number,
  crowdX: number,
  cache: RenderCache,
  font: SkFont
): void {
  const K = CONFIG.crowd;
  const J = CONFIG.juice;
  const V = CONFIG.visual;
  const proj = projectDepth(0, w, h);
  // The blob breathes subtly at idle on top of the steering squish.
  const breathe = 1 + Math.sin(s.time * Math.PI * 2 * V.breatheHz) * V.breatheAmp;
  const bs = blobScale(s.count) * breathe;
  const sx = cx + crowdX * proj.halfW;
  const sy = proj.y;
  // Fast steering squishes the blob narrower (and slightly taller).
  const scaleX = bs * (1 - fx.squish);
  const scaleY = bs * (1 + fx.squish * 0.4);

  const won = s.phase === 'won';
  const lost = s.phase === 'lost';
  const unitR = K.unitRadiusPx * bs;
  const headDist = unitR * 0.9;
  const headR = unitR * K.headRadiusFrac;
  const ow = V.outlinePx * bs;

  // Mama's resting spot, needed up front so her shadow batches with the flock.
  const blobR = blobRadiusPx(s.unitsActive, K.slotSpacingPx) * bs;
  const frontR = blobR * K.ellipseFlatten * (1 + fx.squish * 0.4);
  const mamaR = K.unitRadiusPx * K.mamaScale * bs;
  const mamaHeadR = mamaR * K.headRadiusFrac;
  const mamaBaseY = sy - frontR - K.mamaGapPx - mamaR;

  // Soft drop shadows under every duckling and mama, one batched path.
  drawShadowBatch(canvas, cache, (path, k) => {
    for (let i = 0; i < s.unitsActive; i++) {
      const u = s.units[i];
      const trail =
        hash01(i * 23 + 3) < K.trailChance
          ? (0.35 + 0.65 * hash01(i * 23 + 4)) * K.trailMaxPx * bs
          : 0;
      path.addCircle(
        sx + u.x * scaleX,
        (sy + u.y * scaleY + trail + unitR * V.shadowDropFrac) / k,
        unitR * V.shadowWidthFrac
      );
    }
    path.addCircle(
      sx,
      (mamaBaseY + mamaR * V.shadowDropFrac) / k,
      mamaR * V.shadowWidthFrac
    );
  });

  // Every duckling part batches into one path per layer — dark outline
  // silhouettes, bodies, heads, beaks, eyes: five draw calls for the flock.
  const outlineP = cache.scratchPath(0);
  const bodiesP = cache.scratchPath(1);
  const headsP = cache.scratchPath(2);
  const beaksP = cache.scratchPath(3);
  const eyesP = cache.scratchPath(4);
  // 2-frame waddle clock, shared by the flock; each duckling alternates phase.
  const waddleFrame = Math.floor(s.time * K.waddleFramesPerSec);

  for (let i = s.unitsActive - 1; i >= 0; i--) {
    const u = s.units[i];
    // 2-frame waddle-bob: snap between two poses with a small sideways rock.
    const frame = (waddleFrame + i) & 1;
    let bob = frame ? -K.bobAmplitudePx : 0;
    const rock = (frame ? 1 : -1) * (i & 1 ? 1 : -1) * K.waddleRockPx;
    const px = sx + u.x * scaleX + rock;
    let py = sy + u.y * scaleY;
    // A few ducklings trail behind their slot so the flock shape reads organic.
    if (hash01(i * 23 + 3) < K.trailChance) {
      py += (0.35 + 0.65 * hash01(i * 23 + 4)) * K.trailMaxPx * bs;
    }
    // Each duckling leans by a stable random tilt; a lost one falls sideways.
    let ang = (hash01(i * 31 + 9) - 0.5) * 2 * K.tiltMaxRad;

    if (won) {
      // Staggered victory hop rippling through the flock.
      const t = (fx.phaseTime - i * J.winJumpStaggerSec) / J.winJumpSec;
      if (t > 0 && t < 1) {
        py -= Math.sin(t * Math.PI) * J.winJumpHeightPx;
      }
    } else if (lost) {
      // Ducklings fall over in a wave spreading out from the blob centre.
      const r = Math.sqrt(u.x * u.x + u.y * u.y) * bs;
      const t = clamp((fx.phaseTime - r / J.loseWaveSpeedPx) / J.loseFallSec, 0, 1);
      if (t > 0) {
        bob *= 1 - t;
        ang += (u.x >= 0 ? 1 : -1) * t * (Math.PI / 2);
        py += t * unitR * 0.5;
      }
    }
    py += bob;

    const dirX = Math.sin(ang);
    const dirY = -Math.cos(ang);
    const hpx = px + dirX * headDist;
    const hpy = py + dirY * headDist;
    outlineP.addCircle(px, py, unitR + ow);
    outlineP.addCircle(hpx, hpy, headR + ow);
    addBeak(outlineP, hpx, hpy, headR, dirX, dirY, ow);
    bodiesP.addCircle(px, py, unitR);
    headsP.addCircle(hpx, hpy, headR);
    addBeak(beaksP, hpx, hpy, headR, dirX, dirY, 0);
    addEyes(eyesP, hpx, hpy, headR, dirX, dirY);
  }
  canvas.drawPath(outlineP, cache.paint('outline'));
  canvas.drawPath(bodiesP, cache.paint('crowd'));
  canvas.drawPath(headsP, cache.paint('crowdHead'));
  canvas.drawPath(beaksP, cache.paint('beak'));
  canvas.drawPath(eyesP, cache.paint('outline'));

  // Mama duck leads the flock: bigger, white, sternly browed, just ahead of
  // the blob's front edge, waddling on the same 2-frame clock. Drawn on top.
  {
    const frame = waddleFrame & 1;
    let my = mamaBaseY;
    let bob = frame ? -K.bobAmplitudePx : 0;
    const mx = sx + (frame ? 1 : -1) * K.waddleRockPx;
    let ang = 0;
    if (won) {
      const t = fx.phaseTime / J.winJumpSec;
      if (t > 0 && t < 1) {
        my -= Math.sin(t * Math.PI) * J.winJumpHeightPx;
      }
    } else if (lost) {
      // Mama tips over with the front of the wave.
      const t = clamp((fx.phaseTime - frontR / J.loseWaveSpeedPx) / J.loseFallSec, 0, 1);
      if (t > 0) {
        bob *= 1 - t;
        ang = t * (Math.PI / 2);
        my += t * mamaR * 0.5;
      }
    }
    my += bob;
    const dirX = Math.sin(ang);
    const dirY = -Math.cos(ang);
    const mhx = mx + dirX * mamaR * 0.9;
    const mhy = my + dirY * mamaR * 0.9;
    const mamaOutline = cache.scratchPath(0);
    mamaOutline.addCircle(mx, my, mamaR + ow);
    mamaOutline.addCircle(mhx, mhy, mamaHeadR + ow);
    addBeak(mamaOutline, mhx, mhy, mamaHeadR, dirX, dirY, ow);
    canvas.drawPath(mamaOutline, cache.paint('outline'));
    canvas.drawCircle(mx, my, mamaR, cache.paint('mama'));
    canvas.drawCircle(mhx, mhy, mamaHeadR, cache.paint('mamaHead'));
    const mamaBeak = cache.scratchPath(1);
    addBeak(mamaBeak, mhx, mhy, mamaHeadR, dirX, dirY, 0);
    canvas.drawPath(mamaBeak, cache.paint('beak'));
    const mamaEyes = cache.scratchPath(2);
    addEyes(mamaEyes, mhx, mhy, mamaHeadR, dirX, dirY, K.mamaEyeScale);
    canvas.drawPath(mamaEyes, cache.paint('outline'));
    // Mama's visible brow: two strokes slanting in over the eyes.
    const brow = cache.strokePaint('outline');
    brow.setStrokeWidth(mamaHeadR * K.browStrokeFrac);
    const perpX = -dirY;
    const perpY = dirX;
    for (let side = -1; side <= 1; side += 2) {
      canvas.drawLine(
        mhx + side * perpX * mamaHeadR * K.browInFrac + dirX * mamaHeadR * K.browInUpFrac,
        mhy + side * perpY * mamaHeadR * K.browInFrac + dirY * mamaHeadR * K.browInUpFrac,
        mhx + side * perpX * mamaHeadR * K.browOutFrac + dirX * mamaHeadR * K.browOutUpFrac,
        mhy + side * perpY * mamaHeadR * K.browOutFrac + dirY * mamaHeadR * K.browOutUpFrac,
        brow
      );
    }
  }

  if (s.count > 0 || fx.gambleSpinT > 0) {
    // The count lives in a fixed bottom-centre HUD tag, below the crowd row,
    // so it can never overlap gate text however big the flock gets.
    const labelY = h * V.hudCountYFrac;
    // While a gamble spins, the label ticks slot-machine numbers instead of
    // revealing the rolled count.
    let labelText = `${s.count}`;
    if (fx.gambleSpinT > 0) {
      const tick = Math.floor((J.gambleSpinSec - fx.gambleSpinT) * J.gambleTickHz);
      const hash = Math.imul(tick + 1, 2654435761) >>> 0;
      labelText = `${(hash % Math.max(9, s.count * 3)) + 1}`;
    }
    // Count label pops bigger for a beat whenever a gate or enemy changes it.
    const pop = 1 + (fx.labelPopAmp - 1) * (fx.labelPopT / J.labelPopSec);
    canvas.save();
    canvas.translate(cx, labelY);
    if (pop > 1.001) {
      canvas.scale(pop, pop);
    }
    // Subtle rounded tag behind the chunky-outlined count.
    const tagHalfW = cache.textWidth(font, labelText) / 2 + V.hudTagPadXPx;
    const tagH = K.labelFontSize + V.hudTagPadYPx * 2;
    const tag = cache.paint('hudTag');
    tag.setAlphaf(V.hudTagAlpha);
    canvas.drawRRect(
      Skia.RRectXY(
        Skia.XYWHRect(-tagHalfW, -K.labelFontSize * 0.36 - tagH / 2, tagHalfW * 2, tagH),
        V.hudTagRadiusPx,
        V.hudTagRadiusPx
      ),
      tag
    );
    tag.setAlphaf(1);
    drawChunkyText(canvas, labelText, 0, 0, font, cache, 'label', 'labelShadow', V.countOutlinePx, 1);
    canvas.restore();
  }
}

/**
 * Append one orange beak triangle pointing the way a duck head faces.
 * `dir` is the head's unit facing vector; `grow` pads the triangle so the
 * same helper builds the dark outline silhouette under the fill.
 */
function addBeak(
  path: SkPath,
  hx: number,
  hy: number,
  headR: number,
  dirX: number,
  dirY: number,
  grow: number
): void {
  const K = CONFIG.crowd;
  const halfW = headR * K.beakHalfWidthFrac + grow;
  const len = headR * K.beakLengthFrac + grow * 2;
  const bx = hx + dirX * headR * 0.5;
  const by = hy + dirY * headR * 0.5;
  const perpX = -dirY;
  const perpY = dirX;
  path.moveTo(bx - perpX * halfW, by - perpY * halfW);
  path.lineTo(bx + perpX * halfW, by + perpY * halfW);
  path.lineTo(bx + dirX * len, by + dirY * len);
  path.close();
}

/**
 * Append the two black eyes on the upper sides of a duck head. `rScale`
 * enlarges only the eye radius (mama's face reads at her bigger scale).
 */
function addEyes(
  path: SkPath,
  hx: number,
  hy: number,
  headR: number,
  dirX: number,
  dirY: number,
  rScale = 1
): void {
  const K = CONFIG.crowd;
  const upX = dirX * headR * K.eyeUpFrac;
  const upY = dirY * headR * K.eyeUpFrac;
  const outX = -dirY * headR * K.eyeOutFrac;
  const outY = dirX * headR * K.eyeOutFrac;
  const r = headR * K.eyeRadiusFrac * rScale;
  path.addCircle(hx + upX + outX, hy + upY + outY, r);
  path.addCircle(hx + upX - outX, hy + upY - outY, r);
}

/**
 * Batch soft ellipse drop shadows into a single path drawn under a group of
 * sprites. The canvas is squashed vertically so plain circles come out as
 * ground ellipses; the fill callback adds circles in that squashed space
 * (divide y by `k`), keeping the hot loop free of per-shadow rect allocations.
 */
function drawShadowBatch(
  canvas: SkCanvas,
  cache: RenderCache,
  fill: (path: SkPath, k: number) => void
): void {
  const V = CONFIG.visual;
  const k = V.shadowHeightFrac / V.shadowWidthFrac;
  const shadow = cache.paint('shadow');
  shadow.setAlphaf(V.shadowAlpha);
  canvas.save();
  canvas.scale(1, k);
  const path = cache.scratchPath();
  fill(path, k);
  canvas.drawPath(path, shadow);
  canvas.restore();
  shadow.setAlphaf(1);
}

function drawParticles(canvas: SkCanvas, fx: FxState, cache: RenderCache): void {
  const J = CONFIG.juice;
  const K = CONFIG.crowd;
  let paint: SkPaint;
  for (let i = 0; i < fx.count; i++) {
    const p = fx.particles[i];
    // Fade out over the last half of each particle's life.
    const a = clamp((2 * p.life) / p.life0, 0, 1);
    if (p.kind === ParticleKind.Confetti) {
      // Squares tumble by squashing their height with the spin phase —
      // reads as 3D flips without a canvas transform per particle.
      const size = J.confettiSizePx;
      const flip = 0.25 + 0.75 * Math.abs(Math.sin(p.rot));
      paint = cache.paint(p.good ? 'goodGate' : 'badGate');
      paint.setAlphaf(a);
      canvas.drawRect(
        Skia.XYWHRect(p.x - size / 2, p.y - (size * flip) / 2, size, size * flip),
        paint
      );
    } else if (p.kind === ParticleKind.Coin) {
      paint = cache.paint('coin');
      paint.setAlphaf(a);
      canvas.drawCircle(p.x, p.y, J.coinRadiusPx, paint);
    } else if (p.kind === ParticleKind.Drained) {
      // A duckling snatched away toward the boss, shrinking as it goes.
      const r = K.unitRadiusPx * (0.3 + 0.7 * (p.life / p.life0));
      drawOutlinedDot(canvas, cache, p.x, p.y, r, a);
      paint = cache.paint('crowd');
    } else {
      // A popped-out duckling shrinking as it flies.
      const r = K.unitRadiusPx * (0.5 + 0.5 * (p.life / p.life0));
      drawOutlinedDot(canvas, cache, p.x, p.y, r, a);
      paint = cache.paint('crowd');
    }
    paint.setAlphaf(1);
  }
}

/** A flying duckling dot: outlined yellow circle, used by particles. */
function drawOutlinedDot(
  canvas: SkCanvas,
  cache: RenderCache,
  x: number,
  y: number,
  r: number,
  alpha: number
): void {
  const outline = cache.paint('outline');
  outline.setAlphaf(alpha);
  canvas.drawCircle(x, y, r + CONFIG.visual.outlinePx * 0.7, outline);
  outline.setAlphaf(1);
  const fill = cache.paint('crowd');
  fill.setAlphaf(alpha);
  canvas.drawCircle(x, y, r, fill);
  fill.setAlphaf(1);
}

function drawCenteredText(
  canvas: SkCanvas,
  text: string,
  cx: number,
  baselineY: number,
  font: SkFont,
  paint: SkPaint,
  cache: RenderCache
): void {
  const width = cache.textWidth(font, text);
  canvas.drawText(text, cx - width / 2, baselineY, paint, font);
}

/**
 * Chunky game text: drop shadow, thick rounded outline, then the fill. The
 * outline colour is white for gate operators and dark for the count label.
 */
function drawChunkyText(
  canvas: SkCanvas,
  text: string,
  cx: number,
  baselineY: number,
  font: SkFont,
  cache: RenderCache,
  fill: ColorName,
  outline: ColorName,
  outlinePx: number,
  alpha: number
): void {
  const V = CONFIG.visual;
  const width = cache.textWidth(font, text);
  const x = cx - width / 2;
  // Shadow of the whole outlined glyph: an offset stroke pass in shadow ink.
  const shadowStroke = cache.strokePaint('labelShadow');
  shadowStroke.setStrokeWidth(outlinePx);
  shadowStroke.setAlphaf(V.textShadowAlpha * alpha);
  canvas.drawText(text, x + 2, baselineY + 3, shadowStroke, font);
  shadowStroke.setAlphaf(1);
  const outlinePaint = cache.strokePaint(outline);
  outlinePaint.setStrokeWidth(outlinePx);
  outlinePaint.setAlphaf(alpha);
  canvas.drawText(text, x, baselineY, outlinePaint, font);
  outlinePaint.setAlphaf(1);
  const fillPaint = cache.paint(fill);
  fillPaint.setAlphaf(alpha);
  canvas.drawText(text, x, baselineY, fillPaint, font);
  fillPaint.setAlphaf(1);
}

function drawShadowedText(
  canvas: SkCanvas,
  text: string,
  cx: number,
  baselineY: number,
  font: SkFont,
  cache: RenderCache
): void {
  const width = cache.textWidth(font, text);
  const shadow = cache.paint('labelShadow');
  shadow.setAlphaf(0.8);
  canvas.drawText(text, cx - width / 2 + 2, baselineY + 3, shadow, font);
  shadow.setAlphaf(1);
  canvas.drawText(text, cx - width / 2, baselineY, cache.paint('label'), font);
}
