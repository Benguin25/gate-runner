import { CONFIG } from './config';
import { applyOp, isGoodOp } from './ops';
import { mulberry32 } from './rng';
import type { LevelDef, SimEventKind, SimPhase, SimState } from './types';
import { clamp } from '../engine/utils';
import { slotX, slotY } from '../engine/formation';

export interface SimOptions {
  /** Boss-fight multiplier per unit (strength upgrade). 1 = base. */
  unitStrength?: number;
  /**
   * Seed for this attempt's gamble rolls. Defaults to the level seed, so a
   * given (level, seed) attempt is fully deterministic — the bot relies on it.
   */
  gambleSeed?: number;
}

export function createSimState(level: LevelDef, options?: SimOptions): SimState {
  const units: SimState['units'] = [];
  for (let i = 0; i < CONFIG.crowd.renderCap; i++) {
    units.push({ x: 0, y: 0 });
  }
  const active = Math.min(level.startCount, CONFIG.crowd.renderCap);
  for (let i = 0; i < active; i++) {
    units[i].x = slotX(i, CONFIG.crowd.slotSpacingPx);
    units[i].y = slotY(i, CONFIG.crowd.slotSpacingPx);
  }
  return {
    phase: 'running',
    time: 0,
    count: level.startCount,
    distance: 0,
    prevDistance: 0,
    crowdX: 0,
    prevCrowdX: 0,
    targetX: 0,
    gates: level.gatePairs.map((g) => ({ ...g, used: false, hitSide: 0, flash: 0 })),
    enemies: level.enemies.map((e) => ({ ...e, alive: true })),
    boss: { z: level.boss.z, count: level.boss.count, knockT: 0 },
    unitStrength: options?.unitStrength ?? 1,
    gambleRng: mulberry32(options?.gambleSeed ?? level.seed),
    drainAcc: 0,
    units,
    unitsActive: active,
    events: [],
  };
}

// Queue a juice event. Capped so headless callers that never drain the queue
// (bot, boss playouts) cannot grow it without bound.
function emit(s: SimState, kind: SimEventKind): void {
  if (s.events.length < CONFIG.engine.maxQueuedEvents) {
    s.events.push({ kind });
  }
}

/** One fixed 60hz simulation step. Mutates the state in place; returns the phase after the step. */
export function updateSim(s: SimState, dt: number): SimPhase {
  if (s.phase === 'won' || s.phase === 'lost') {
    return s.phase;
  }
  s.time += dt;

  if (s.phase === 'running') {
    s.prevDistance = s.distance;
    s.distance += CONFIG.run.speed * dt;

    s.prevCrowdX = s.crowdX;
    const target = clamp(s.targetX, -CONFIG.run.maxCrowdX, CONFIG.run.maxCrowdX);
    s.crowdX += (target - s.crowdX) * Math.min(1, CONFIG.run.steerLerp * dt);

    // Gate walls: crossing one applies the operator of the side the crowd
    // centre is on — you always pass through exactly one of the row. A row
    // with a middle gamble gate splits into thirds; hitting the middle rolls
    // 50/50 between xN and ÷N from the attempt-seeded RNG.
    for (let i = 0; i < s.gates.length; i++) {
      const gate = s.gates[i];
      if (!gate.used && s.prevDistance < gate.z && s.distance >= gate.z) {
        const third = CONFIG.gates.trioThirdX;
        const side: -1 | 0 | 1 =
          gate.middle && Math.abs(s.crowdX) < third ? 0 : s.crowdX >= 0 ? 1 : -1;
        gate.used = true;
        gate.hitSide = side;
        gate.flash = CONFIG.gates.hitFlashSec;
        if (side === 0 && gate.middle) {
          const won = s.gambleRng() < 0.5;
          const op = { kind: won ? ('mul' as const) : ('div' as const), value: gate.middle.value };
          s.count = applyOp(s.count, op);
          emit(s, won ? 'gambleWin' : 'gambleLose');
        } else {
          const op = side > 0 ? gate.right : gate.left;
          s.count = applyOp(s.count, op);
          emit(s, isGoodOp(op) ? 'gateGood' : 'gateBad');
        }
      }
      if (gate.flash > 0) {
        gate.flash = Math.max(0, gate.flash - dt);
      }
    }

    // Enemy clumps: contact removes one crowd unit per enemy.
    for (let i = 0; i < s.enemies.length; i++) {
      const e = s.enemies[i];
      if (
        e.alive &&
        s.prevDistance < e.z &&
        s.distance >= e.z &&
        Math.abs(s.crowdX - e.x) < CONFIG.enemies.hitWindowX
      ) {
        e.alive = false;
        s.count = Math.max(0, s.count - e.count);
        emit(s, 'enemyHit');
      }
    }

    if (s.count <= 0) {
      s.phase = 'lost';
      emit(s, 'lost');
      return s.phase;
    }

    if (s.distance >= s.boss.z - CONFIG.boss.contactDistance) {
      s.distance = s.boss.z - CONFIG.boss.contactDistance;
      s.prevDistance = s.distance;
      s.phase = 'boss';
    }
  }

  if (s.phase === 'boss') {
    if (s.count * s.unitStrength > s.boss.count) {
      // Big enough: mama caps the drain, then the level clears.
      if (s.boss.knockT === 0) {
        emit(s, 'bossHit');
      }
      s.boss.knockT += dt / CONFIG.boss.knockbackSec;
      if (s.boss.knockT >= 1) {
        s.boss.knockT = 1;
        s.phase = 'won';
        emit(s, 'won');
      }
    } else {
      // Too small: the ducklings get pulled into the drain one by one.
      s.drainAcc += CONFIG.boss.drainPerSec * dt;
      const whole = Math.floor(s.drainAcc);
      if (whole > 0) {
        s.drainAcc -= whole;
        s.count = Math.max(0, s.count - whole);
        emit(s, 'drained');
      }
      if (s.count <= 0) {
        s.phase = 'lost';
        emit(s, 'lost');
      }
    }
  }

  updateUnits(s, dt);
  return s.phase;
}

// Rendered units are visual only: they interpolate toward phyllotaxis slots,
// new units spring in from the crowd centre, and the count label carries the
// real number.
function updateUnits(s: SimState, dt: number): void {
  const n = Math.min(s.count, CONFIG.crowd.renderCap);
  if (n > s.unitsActive) {
    for (let i = s.unitsActive; i < n; i++) {
      s.units[i].x = 0;
      s.units[i].y = 0;
    }
  }
  s.unitsActive = n;
  const k = Math.min(1, CONFIG.crowd.slotLerp * dt);
  const spacing = CONFIG.crowd.slotSpacingPx;
  for (let i = 0; i < n; i++) {
    const u = s.units[i];
    u.x += (slotX(i, spacing) - u.x) * k;
    u.y += (slotY(i, spacing) - u.y) * k;
  }
}
