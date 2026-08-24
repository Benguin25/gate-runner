// Headless render profile: measures the per-frame JS cost of the game loop at
// the 300-unit render cap — one fixed sim step, the juice/particle update and
// full drawGame command generation — against the Skia mock in
// scripts/skiaMock.ts, and reports the per-frame allocation / draw-call
// counts that drive the native Skia cost.
//
// Run with: npx tsx --tsconfig scripts/tsconfig.profile.json scripts/profile.ts

import { makeCanvas, makeFont, resetStats, stats } from './skiaMock';
import { CONFIG } from '../src/game/config';
import { createSimState, updateSim } from '../src/game/sim';
import type { LevelDef } from '../src/game/types';
import { createRenderCache } from '../src/render/cache';
import { drawGame } from '../src/render/drawGame';
import { applyFxEvent, createFxState, fxTimeScale, updateFx } from '../src/render/fx';
import type { GameFonts } from '../src/render/fonts';

const WIDTH = 412; // typical mid-range Android portrait, dp
const HEIGHT = 915;
const FRAMES = 5000;
const WARMUP = 500;

// Dense synthetic level: crowd at the render cap, several gates and enemy
// clumps in view at once — a worst-case frame.
const level: LevelDef = {
  seed: 1,
  startCount: CONFIG.crowd.renderCap,
  gatePairs: [
    { z: 6, left: { kind: 'add', value: 20 }, right: { kind: 'sub', value: 10 } },
    { z: 14, left: { kind: 'mul', value: 2 }, right: { kind: 'div', value: 2 } },
    { z: 22, left: { kind: 'add', value: 50 }, right: { kind: 'mul', value: 2 } },
    { z: 30, left: { kind: 'add', value: 100 }, right: { kind: 'sub', value: 40 } },
  ],
  enemies: [
    { z: 10, x: -0.4, count: 30 },
    { z: 18, x: 0.3, count: 30 },
    { z: 26, x: 0, count: 40 },
  ],
  // Close enough to stay on screen the whole run — the boss draw is included
  // in every measured frame.
  boss: { z: 60, count: 100 },
};

function main(): void {
  const font = makeFont();
  const fonts = { label: font, gate: font, small: font, boss: font } as unknown as GameFonts;
  const cache = createRenderCache();
  const dt = CONFIG.engine.fixedStep;

  let sim = createSimState(level);
  const fx = createFxState();
  const frame = (i: number): void => {
    // Steer back and forth so the crowd keeps interpolating and squishing.
    sim.targetX = Math.sin(i * 0.02) * CONFIG.run.maxCrowdX;
    updateSim(sim, dt * fxTimeScale(fx));
    for (const ev of sim.events) {
      applyFxEvent(fx, ev, sim, WIDTH, HEIGHT);
    }
    sim.events.length = 0;
    updateFx(fx, dt, sim, WIDTH, HEIGHT);
    // Loop the run so gates/enemies (and gate-hit particle bursts) stay in
    // view for every measured frame.
    if (sim.distance > 28 || sim.phase !== 'running') {
      sim = createSimState(level);
    }
    const canvas = makeCanvas();
    drawGame(canvas as never, sim, fx, WIDTH, HEIGHT, 0.5, fonts, cache);
  };

  for (let i = 0; i < WARMUP; i++) {
    frame(i);
  }

  resetStats();
  frame(WARMUP);
  const perFrame = { ...stats };

  const times = new Float64Array(FRAMES);
  const t0 = performance.now();
  for (let i = 0; i < FRAMES; i++) {
    const f0 = performance.now();
    frame(i + WARMUP);
    times[i] = performance.now() - f0;
  }
  const total = performance.now() - t0;

  const sorted = Array.from(times).sort((a, b) => a - b);
  const mean = total / FRAMES;
  const p50 = sorted[Math.floor(FRAMES * 0.5)];
  const p99 = sorted[Math.floor(FRAMES * 0.99)];
  const worst = sorted[FRAMES - 1];

  console.log(`gate-runner render profile — ${FRAMES} frames @ ${sim.unitsActive} rendered units`);
  console.log(`frame JS time  mean ${mean.toFixed(3)}ms  p50 ${p50.toFixed(3)}ms  p99 ${p99.toFixed(3)}ms  worst ${worst.toFixed(3)}ms`);
  console.log(`(60fps budget is 16.7ms for update + record + native rasterization)`);
  console.log(`per frame: ${perFrame.drawCalls} draw calls, ${perFrame.setColors} setColor, ` +
    `${perFrame.colorParses} colour parses, ${perFrame.paints} Paint allocs, ${perFrame.paths} Path allocs`);
}

main();
