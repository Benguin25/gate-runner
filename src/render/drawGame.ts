import type { SkCanvas, SkFont, SkPaint, SkPath } from '@shopify/react-native-skia';
import { Skia } from '@shopify/react-native-skia';
import { CONFIG } from '../game/config';
import { isGoodOp, opLabel } from '../game/ops';
import type { SimState } from '../game/types';
import { blobRadiusPx, blobScale, slotX, slotY } from '../engine/formation';
import { projectDepth, isCulled } from '../engine/projection';
import { clamp, lerp } from '../engine/utils';
import type { GameFonts } from './fonts';
import type { RenderCache } from './cache';
import { ParticleKind, shakeOffset, type FxState } from './fx';

// Everything is drawn procedurally with Skia — no image assets. Called once
// per frame from GameCanvas's picture recording on the JS thread. Paints,
// colours and static lane geometry come from the RenderCache: at the 300-unit
// render cap this loop is the hot path, so it makes no per-frame Skia
// allocations and no setColor calls with string colours.

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

  canvas.drawRect(Skia.XYWHRect(0, 0, w, h), cache.paint('bg'));

  // Boss-hit screen shake displaces the whole world; the flash overlay below
  // stays put.
  const shake = shakeOffset(fx);
  const shaken = shake.x !== 0 || shake.y !== 0;
  if (shaken) {
    canvas.save();
    canvas.translate(shake.x, shake.y);
  }

  drawLane(canvas, w, h, dist, cache);
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

function drawLane(
  canvas: SkCanvas,
  w: number,
  h: number,
  dist: number,
  cache: RenderCache
): void {
  const L = CONFIG.lane;
  const lane = cache.laneGeometry(w, h);
  canvas.drawPath(lane.surface, cache.paint('lane'));
  canvas.drawPath(lane.leftEdge, cache.edgePaint);
  canvas.drawPath(lane.rightEdge, cache.edgePaint);

  // Cross-lane stripes scrolling toward the camera for a sense of speed.
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
  const text = cache.paint('gateText');
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
    const wallH = G.heightPx * proj.scale;
    const r = G.cornerRadiusPx * proj.scale;
    // A row with a middle gamble gate is a trio of thirds, otherwise halves.
    const cols = gate.middle ? 3 : 2;
    const colW = (proj.halfW * 2) / cols;

    for (let c = 0; c < cols; c++) {
      const side = cols === 3 ? c - 1 : c === 0 ? -1 : 1;
      const gamble = cols === 3 && side === 0 ? gate.middle : undefined;
      const op = side < 0 ? gate.left : gate.right;
      const x0 = cx - proj.halfW + c * colW;
      let a: number = (gate.used ? G.passedOpacity : G.opacity) * dim;
      if (gate.used && gate.hitSide === side && gate.flash > 0) {
        // The chosen gate flashes bright as the number pops.
        a = lerp(G.passedOpacity, 1, gate.flash / G.hitFlashSec);
      }
      const wall = cache.paint(
        gamble ? 'gambleGate' : isGoodOp(op) ? 'goodGate' : 'badGate'
      );
      wall.setAlphaf(a);
      canvas.drawRRect(
        Skia.RRectXY(Skia.XYWHRect(x0, proj.y - wallH, colW, wallH), r, r),
        wall
      );
      wall.setAlphaf(1);

      text.setAlphaf(clamp(a + 0.25, 0, 1));
      canvas.save();
      canvas.translate(x0 + colW / 2, proj.y - wallH / 2);
      canvas.scale(textScale, textScale);
      if (gamble) {
        // Both possible outcomes stacked: the gamble shows what it offers.
        drawCenteredText(canvas, `x${gamble.value}`, 0, -G.textFontSize * 0.1, smallFont, text, cache);
        drawCenteredText(canvas, `÷${gamble.value}`, 0, G.textFontSize * 0.57, smallFont, text, cache);
      } else {
        drawCenteredText(canvas, opLabel(op), 0, G.textFontSize * 0.36, font, text, cache);
      }
      canvas.restore();
    }
  }
  text.setAlphaf(1);
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
  const body = cache.paint('enemy');
  const head = cache.paint('enemyHead');
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
      canvas.drawCircle(px, py, r, body);
      canvas.drawCircle(px, py - r * 0.9, r * CONFIG.crowd.headRadiusFrac, head);
    }
    const clumpR = blobRadiusPx(n, E.slotSpacingPx) * proj.scale;
    canvas.save();
    canvas.translate(ex, proj.y - clumpR - 6 * proj.scale);
    canvas.scale(proj.scale, proj.scale);
    drawCenteredText(canvas, `${e.count}`, 0, 0, font, cache.paint('label'), cache);
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
  const dz = s.boss.z - dist;
  if (isCulled(dz)) {
    return;
  }
  const proj = projectDepth(dz, w, h);
  // knockT doubles as the win animation clock: mama caps the drain.
  const kt = s.boss.knockT;
  // Suction pulse while ducklings are being pulled in.
  const losing = s.phase === 'boss' && s.count <= s.boss.count && s.count > 0;
  const pulse = losing
    ? 1 + Math.abs(Math.sin(s.time * Math.PI * 2 * B.pulseHz)) * B.pulseScale
    : 1;

  const R = B.bodyRadiusPx;
  canvas.save();
  canvas.translate(cx, proj.y);
  // The grate lies on the path: flattened by the fake perspective.
  canvas.scale(proj.scale * pulse, proj.scale * B.drainFlatten * pulse);
  canvas.drawCircle(0, 0, R, cache.paint('drainRim'));
  canvas.drawCircle(0, 0, R * (1 - B.rimFrac), cache.paint('drain'));
  canvas.drawPath(cache.drainSlotsPath(), cache.paint('drainSlot'));
  if (kt > 0) {
    // Win: the cover slides in from the crowd side and seats with an ease-out.
    const slide = 1 - (1 - kt) * (1 - kt);
    canvas.drawCircle(0, (1 - slide) * R * 3.5, R * (1 - B.rimFrac * 0.4), cache.paint('drainCap'));
  }
  canvas.restore();

  // The number over the drain, until the cap covers it.
  if (kt < 0.2) {
    canvas.save();
    canvas.translate(cx, proj.y - (R * B.drainFlatten + B.numberGapPx) * proj.scale);
    canvas.scale(proj.scale, proj.scale);
    drawShadowedText(canvas, `${s.boss.count}`, 0, 0, font, cache);
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
  const proj = projectDepth(0, w, h);
  const bs = blobScale(s.count);
  const sx = cx + crowdX * proj.halfW;
  const sy = proj.y;
  // Fast steering squishes the blob narrower (and slightly taller).
  const scaleX = bs * (1 - fx.squish);
  const scaleY = bs * (1 + fx.squish * 0.4);

  const won = s.phase === 'won';
  const lost = s.phase === 'lost';
  const body = cache.paint('crowd');
  const head = cache.paint('crowdHead');
  const headDist = K.unitRadiusPx * bs * 0.9;
  const headR = K.unitRadiusPx * bs * K.headRadiusFrac;
  // All beaks batch into one shared path — one draw call, no allocations.
  const beaks = cache.scratchPath();
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
    // Head offset from the body centre; tips sideways as a lost duckling falls.
    let hx = 0;
    let hy = -headDist;

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
        const angle = t * (Math.PI / 2);
        const dir = u.x >= 0 ? 1 : -1;
        hx = Math.sin(angle) * dir * headDist;
        hy = -Math.cos(angle) * headDist;
        py += t * K.unitRadiusPx * bs * 0.5;
      }
    }

    py += bob;
    canvas.drawCircle(px, py, K.unitRadiusPx * bs, body);
    canvas.drawCircle(px + hx, py + hy, headR, head);
    addBeak(beaks, px + hx, py + hy, headR);
  }

  // Mama duck leads the flock: bigger, white, just ahead of the blob's front
  // edge, waddling on the same 2-frame clock.
  const blobR = blobRadiusPx(s.unitsActive, K.slotSpacingPx) * bs;
  const frontR = blobR * K.ellipseFlatten * (1 + fx.squish * 0.4);
  const mamaR = K.unitRadiusPx * K.mamaScale * bs;
  const mamaHeadR = mamaR * K.headRadiusFrac;
  {
    const frame = waddleFrame & 1;
    let my = sy - frontR - K.mamaGapPx - mamaR;
    let bob = frame ? -K.bobAmplitudePx : 0;
    const mx = sx + (frame ? 1 : -1) * K.waddleRockPx;
    let hx = 0;
    let hy = -mamaR * 0.9;
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
        const angle = t * (Math.PI / 2);
        hx = Math.sin(angle) * mamaR * 0.9;
        hy = -Math.cos(angle) * mamaR * 0.9;
        my += t * mamaR * 0.5;
      }
    }
    my += bob;
    canvas.drawCircle(mx, my, mamaR, cache.paint('mama'));
    canvas.drawCircle(mx + hx, my + hy, mamaHeadR, cache.paint('mamaHead'));
    addBeak(beaks, mx + hx, my + hy, mamaHeadR);
  }
  canvas.drawPath(beaks, cache.paint('beak'));

  if (s.count > 0 || fx.gambleSpinT > 0) {
    // The label clears the flock and mama.
    const labelY =
      sy - Math.max(blobR, frontR + K.mamaGapPx + mamaR * 2) - K.labelGapPx;
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
    if (pop > 1.001) {
      canvas.save();
      canvas.translate(sx, labelY);
      canvas.scale(pop, pop);
      drawShadowedText(canvas, labelText, 0, 0, font, cache);
      canvas.restore();
    } else {
      drawShadowedText(canvas, labelText, sx, labelY, font, cache);
    }
  }
}

/** Append one up-pointing orange beak triangle at a duck head position. */
function addBeak(path: SkPath, hx: number, hy: number, headR: number): void {
  const K = CONFIG.crowd;
  const halfW = headR * K.beakHalfWidthFrac;
  const len = headR * K.beakLengthFrac;
  const baseY = hy - headR * 0.5;
  path.moveTo(hx - halfW, baseY);
  path.lineTo(hx + halfW, baseY);
  path.lineTo(hx, baseY - len);
  path.close();
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
      // A duckling being pulled into the drain, shrinking as it goes.
      paint = cache.paint('crowd');
      paint.setAlphaf(a);
      canvas.drawCircle(p.x, p.y, K.unitRadiusPx * (0.3 + 0.7 * (p.life / p.life0)), paint);
    } else {
      // A popped-out duckling shrinking as it flies.
      paint = cache.paint('crowd');
      paint.setAlphaf(a);
      canvas.drawCircle(p.x, p.y, K.unitRadiusPx * (0.5 + 0.5 * (p.life / p.life0)), paint);
    }
    paint.setAlphaf(1);
  }
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
