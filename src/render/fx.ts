import { CONFIG } from '../game/config';
import { projectDepth } from '../engine/projection';
import { clamp } from '../engine/utils';
import type { SimEvent, SimState } from '../game/types';

// Juice state, separate from the sim: particles (confetti, coins, popped
// units), the boss-hit slow-mo and screen shake, the bad-gate red flash, the
// count-label pop, the steering squish, and the post-result timer that lets
// win/lose animations play before the overlay appears. All purely visual —
// nothing here feeds back into the sim. Particle randomness uses Math.random
// on purpose: only the sim has to be deterministic.

export const ParticleKind = {
  Confetti: 0,
  Coin: 1,
  Unit: 2,
  /** A duckling snatched away by the boss crab: no gravity, shrinks away. */
  Drained: 3,
} as const;
export type ParticleKind = (typeof ParticleKind)[keyof typeof ParticleKind];

export interface Particle {
  kind: ParticleKind;
  /** Confetti only: teal (good gate) or red (bad gate). */
  good: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vrot: number;
  life: number;
  life0: number;
}

export interface FxState {
  /** Seconds of boss-hit slow motion remaining (real time). */
  slowmoT: number;
  /** Seconds of screen shake remaining. */
  shakeT: number;
  /** Seconds of bad-gate red flash remaining. */
  flashT: number;
  /** Seconds of gamble-gate purple flash remaining. */
  gambleFlashT: number;
  /** Seconds of gamble slot-machine spin remaining; label ticks while > 0. */
  gambleSpinT: number;
  /** Rolled outcome of the spinning gamble (revealed when the spin ends). */
  gambleGood: boolean;
  /** Set for one frame when the spin lands, so the caller can play sounds. */
  gambleLanded: boolean;
  /** Seconds of count-label pop remaining. */
  labelPopT: number;
  /** Peak scale of the current label pop (bigger when a gamble lands). */
  labelPopAmp: number;
  /** Current blob squish from fast steering, 0..squishMax. */
  squish: number;
  /** Seconds since the sim reached won/lost; drives jump/fall animations. */
  phaseTime: number;
  /** Set once the result overlay has been requested. */
  resultShown: boolean;
  /** Fixed-size particle pool; the first `count` entries are live. */
  particles: Particle[];
  count: number;
}

export function createFxState(): FxState {
  const particles: Particle[] = [];
  for (let i = 0; i < CONFIG.juice.maxParticles; i++) {
    particles.push({
      kind: ParticleKind.Confetti,
      good: true,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      rot: 0,
      vrot: 0,
      life: 0,
      life0: 1,
    });
  }
  return {
    slowmoT: 0,
    shakeT: 0,
    flashT: 0,
    gambleFlashT: 0,
    gambleSpinT: 0,
    gambleGood: false,
    gambleLanded: false,
    labelPopT: 0,
    labelPopAmp: CONFIG.juice.labelPopScale,
    squish: 0,
    phaseTime: 0,
    resultShown: false,
    particles,
    count: 0,
  };
}

/** Sim time scale for this frame: slowed while the boss-hit slow-mo runs. */
export function fxTimeScale(fx: FxState): number {
  return fx.slowmoT > 0 ? CONFIG.juice.slowmoScale : 1;
}

function rand(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

function spawn(fx: FxState): Particle | null {
  if (fx.count >= fx.particles.length) {
    return null;
  }
  return fx.particles[fx.count++];
}

/** Screen position of the crowd centre — where bursts originate. */
export function crowdScreenPos(s: SimState, w: number, h: number): { x: number; y: number } {
  const proj = projectDepth(0, w, h);
  return { x: w / 2 + s.crowdX * proj.halfW, y: proj.y };
}

function burstConfetti(fx: FxState, good: boolean, x: number, y: number): void {
  const J = CONFIG.juice;
  for (let i = 0; i < J.confettiCount; i++) {
    const p = spawn(fx);
    if (!p) {
      return;
    }
    const angle = rand(0, Math.PI * 2);
    const speed = rand(J.confettiSpeedMinPx, J.confettiSpeedMaxPx);
    p.kind = ParticleKind.Confetti;
    p.good = good;
    p.x = x;
    p.y = y;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed - J.confettiUpKickPx;
    p.rot = rand(0, Math.PI * 2);
    p.vrot = rand(-J.confettiSpinMaxRad, J.confettiSpinMaxRad);
    p.life0 = J.confettiLifeSec * rand(0.7, 1);
    p.life = p.life0;
  }
}

function popUnits(fx: FxState, n: number, x: number, y: number): void {
  const J = CONFIG.juice;
  for (let i = 0; i < n; i++) {
    const p = spawn(fx);
    if (!p) {
      return;
    }
    const angle = rand(0, Math.PI * 2);
    const speed = rand(J.popUnitSpeedMinPx, J.popUnitSpeedMaxPx);
    p.kind = ParticleKind.Unit;
    p.x = x + Math.cos(angle) * rand(0, 20);
    p.y = y + Math.sin(angle) * rand(0, 10);
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed * 0.5 - J.popUnitUpKickPx;
    p.rot = 0;
    p.vrot = 0;
    p.life0 = J.popUnitLifeSec * rand(0.75, 1);
    p.life = p.life0;
  }
}

/** Ducklings snatched from the flock by the boss: straight homing flights. */
function pullDucklings(fx: FxState, n: number, s: SimState, w: number, h: number): void {
  const J = CONFIG.juice;
  const from = crowdScreenPos(s, w, h);
  const boss = projectDepth(s.boss.z - s.distance, w, h);
  for (let i = 0; i < n; i++) {
    const p = spawn(fx);
    if (!p) {
      return;
    }
    const life = J.drainPullSec * rand(0.8, 1.1);
    const x = from.x + rand(-24, 24);
    const y = from.y + rand(-10, 10);
    p.kind = ParticleKind.Drained;
    p.x = x;
    p.y = y;
    p.vx = (w / 2 - x) / life;
    p.vy = (boss.y - y) / life;
    p.rot = 0;
    p.vrot = rand(-8, 8);
    p.life0 = life;
    p.life = life;
  }
}

function fountainCoins(fx: FxState, x: number, y: number): void {
  const J = CONFIG.juice;
  for (let i = 0; i < J.coinCount; i++) {
    const p = spawn(fx);
    if (!p) {
      return;
    }
    p.kind = ParticleKind.Coin;
    p.x = x + rand(-14, 14);
    p.y = y;
    p.vx = rand(-J.coinSpeedMaxPx, J.coinSpeedMaxPx);
    p.vy = -J.coinUpKickPx * rand(0.55, 1) - rand(J.coinSpeedMinPx, J.coinSpeedMaxPx) * 0.2;
    p.rot = rand(0, Math.PI * 2);
    p.vrot = rand(-6, 6);
    p.life0 = J.coinLifeSec * rand(0.7, 1);
    p.life = p.life0;
  }
}

/**
 * React to one sim event: spawn the matching visuals. Sound and haptics are
 * the caller's job (they touch platform modules the render layer stays out of).
 */
export function applyFxEvent(fx: FxState, ev: SimEvent, s: SimState, w: number, h: number): void {
  const J = CONFIG.juice;
  const at = crowdScreenPos(s, w, h);
  switch (ev.kind) {
    case 'gateGood':
      burstConfetti(fx, true, at.x, at.y);
      fx.labelPopT = J.labelPopSec;
      fx.labelPopAmp = J.labelPopScale;
      break;
    case 'gateBad':
      burstConfetti(fx, false, at.x, at.y);
      popUnits(fx, J.popUnitsMax, at.x, at.y);
      fx.flashT = J.redFlashSec;
      fx.labelPopT = J.labelPopSec;
      fx.labelPopAmp = J.labelPopScale;
      break;
    case 'gambleWin':
    case 'gambleLose':
      // The roll is decided, but the reveal waits: purple flash now, the
      // label spins slot-machine numbers, and updateFx lands the result.
      fx.gambleGood = ev.kind === 'gambleWin';
      fx.gambleFlashT = J.gambleFlashSec;
      fx.gambleSpinT = J.gambleSpinSec;
      break;
    case 'enemyHit':
      popUnits(fx, J.popUnitsEnemyMax, at.x, at.y);
      fx.labelPopT = J.labelPopSec;
      fx.labelPopAmp = J.labelPopScale;
      break;
    case 'drained':
      pullDucklings(fx, J.drainPullMaxPerTick, s, w, h);
      break;
    case 'bossHit':
      fx.slowmoT = J.slowmoSec;
      fx.shakeT = J.shakeSec;
      break;
    case 'won':
      fountainCoins(fx, at.x, at.y);
      break;
    case 'lost':
      break;
  }
}

/**
 * Advance the juice state one frame. `dt` is real (unscaled) time so slow-mo
 * decays at wall-clock speed; particles advance on scaled time so they share
 * the sim's slow motion.
 */
export function updateFx(fx: FxState, dt: number, s: SimState, w: number, h: number): void {
  const J = CONFIG.juice;
  const scaled = dt * fxTimeScale(fx);

  fx.slowmoT = Math.max(0, fx.slowmoT - dt);
  fx.shakeT = Math.max(0, fx.shakeT - dt);
  fx.flashT = Math.max(0, fx.flashT - dt);
  fx.gambleFlashT = Math.max(0, fx.gambleFlashT - dt);
  fx.labelPopT = Math.max(0, fx.labelPopT - dt);

  // Gamble slot-machine spin: when it runs out, the number lands — big pop,
  // outcome-coloured burst, and a one-frame flag so the caller plays sounds.
  fx.gambleLanded = false;
  if (fx.gambleSpinT > 0) {
    fx.gambleSpinT = Math.max(0, fx.gambleSpinT - dt);
    if (fx.gambleSpinT === 0) {
      fx.gambleLanded = true;
      fx.labelPopT = J.labelPopSec;
      fx.labelPopAmp = J.gambleLandPopScale;
      const at = crowdScreenPos(s, w, h);
      burstConfetti(fx, fx.gambleGood, at.x, at.y);
      if (!fx.gambleGood) {
        fx.flashT = J.redFlashSec;
        popUnits(fx, J.popUnitsMax, at.x, at.y);
      }
    }
  }

  // Steering squish follows the crowd centre's lateral speed.
  const vel = Math.abs(s.crowdX - s.prevCrowdX) / CONFIG.engine.fixedStep;
  const target = clamp(vel * J.squishPerVel, 0, J.squishMax);
  fx.squish += (target - fx.squish) * Math.min(1, J.squishLerp * dt);

  if (s.phase === 'won' || s.phase === 'lost') {
    fx.phaseTime += dt;
  } else {
    fx.phaseTime = 0;
  }

  // Particles: integrate, gravity, swap-remove the dead.
  let i = 0;
  while (i < fx.count) {
    const p = fx.particles[i];
    p.life -= scaled;
    if (p.life <= 0) {
      fx.count--;
      const last = fx.particles[fx.count];
      fx.particles[fx.count] = p;
      fx.particles[i] = last;
      continue;
    }
    const g =
      p.kind === ParticleKind.Confetti
        ? J.confettiGravityPx
        : p.kind === ParticleKind.Coin
          ? J.coinGravityPx
          : p.kind === ParticleKind.Drained
            ? 0 // Homing straight at the boss; gravity would miss it.
            : J.popUnitGravityPx;
    p.vy += g * scaled;
    p.x += p.vx * scaled;
    p.y += p.vy * scaled;
    p.rot += p.vrot * scaled;
    i++;
  }
}

/** Current screen-shake offset; {0,0} when idle. */
export function shakeOffset(fx: FxState): { x: number; y: number } {
  if (fx.shakeT <= 0) {
    return { x: 0, y: 0 };
  }
  const J = CONFIG.juice;
  const decay = fx.shakeT / J.shakeSec;
  const t = J.shakeSec - fx.shakeT;
  return {
    x: Math.sin(t * J.shakeFreqX) * J.shakeAmplitudePx * decay,
    y: Math.cos(t * J.shakeFreqY) * J.shakeAmplitudePx * 0.7 * decay,
  };
}
