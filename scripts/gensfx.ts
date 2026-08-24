// Offline SFX synthesis. Generates every game sound procedurally and writes
// them to assets/sfx/*.wav (16-bit mono, 22050 Hz), which are committed —
// the app never synthesizes audio at runtime. Total size must stay well under
// the 400KB budget from SPEC.md; the script prints per-file and total sizes.
//
// Run with: npx tsx scripts/gensfx.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SAMPLE_RATE = 22050;
const OUT_DIR = join(__dirname, '..', 'assets', 'sfx');

type Synth = (t: number, dur: number) => number;

/** Render `dur` seconds of a synth function into 16-bit PCM samples. */
function render(dur: number, synth: Synth): Int16Array {
  const n = Math.round(dur * SAMPLE_RATE);
  const out = new Int16Array(n);
  const fadeSamples = Math.min(n, Math.round(SAMPLE_RATE * 0.004));
  for (let i = 0; i < n; i++) {
    let v = synth(i / SAMPLE_RATE, dur);
    // Declick: short linear fade at both ends.
    if (i < fadeSamples) {
      v *= i / fadeSamples;
    }
    if (n - 1 - i < fadeSamples) {
      v *= (n - 1 - i) / fadeSamples;
    }
    out[i] = Math.round(Math.max(-1, Math.min(1, v)) * 32767);
  }
  return out;
}

function wav(samples: Int16Array): Buffer {
  const dataSize = samples.length * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SAMPLE_RATE, 24);
  buf.writeUInt32LE(SAMPLE_RATE * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  Buffer.from(samples.buffer, samples.byteOffset, dataSize).copy(buf, 44);
  return buf;
}

// Deterministic noise so the committed files are reproducible.
function makeNoise(): () => number {
  let state = 0x9e3779b9;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff - 0.5;
  };
}

const TWO_PI = Math.PI * 2;

/** Sine with an exponentially gliding pitch; phase-continuous. */
function glide(t: number, f0: number, f1: number, dur: number): number {
  const k = Math.log(f1 / f0) / dur;
  // Integral of f0 * e^(k t) gives the phase of the exponential sweep.
  const phase = (f0 * (Math.exp(k * t) - 1)) / k;
  return Math.sin(TWO_PI * phase);
}

function envExp(t: number, rate: number): number {
  return Math.exp(-rate * t);
}

// --- The sounds ---------------------------------------------------------

/**
 * One cartoon quack: a nasal falling sawtooth with a formant partial, a
 * fast buzz, and a "wah" envelope. Shared by the gate pop and the win chorus.
 */
function quack(t: number, f0: number, dur: number): number {
  if (t < 0 || t >= dur) {
    return 0;
  }
  const f1 = f0 * 0.62;
  const k = Math.log(f1 / f0) / dur;
  const phase = (f0 * (Math.exp(k * t) - 1)) / k;
  const saw = 2 * (phase - Math.floor(phase)) - 1;
  const formant = Math.sin(TWO_PI * 1150 * t) * 0.3;
  const buzz = 1 + 0.22 * Math.sin(TWO_PI * 95 * t);
  const env = Math.min(1, t / 0.012) * Math.pow(1 - t / dur, 1.35);
  return (saw * 0.7 + formant) * buzz * env;
}

/** Gate pass: bright little pop with a small quack layered on top. */
function pop(): Int16Array {
  return render(0.22, (t) => {
    const tone = glide(t, 1050, 420, 0.13);
    const sparkle = glide(t, 2100, 840, 0.13) * 0.25;
    const popPart = (tone + sparkle) * envExp(t, 26) * 0.6;
    return popPart + quack(t - 0.015, 470, 0.19) * 0.42;
  });
}

/** Bad gate: comic balloon-deflate — wobbling square wave sliding down. */
function deflate(): Int16Array {
  const noise = makeNoise();
  return render(0.42, (t, dur) => {
    const wobble = 1 + 0.13 * Math.sin(TWO_PI * 27 * t);
    const f = 520 * Math.pow(130 / 520, t / dur) * wobble;
    const square = Math.sign(Math.sin(TWO_PI * f * t)) * 0.28;
    const breath = noise() * 0.16 * envExp(t, 5);
    return (square + breath) * envExp(t, 6) * 0.85;
  });
}

/** Enemy contact: short slap of noise over a low thump. */
function hit(): Int16Array {
  const noise = makeNoise();
  let lp = 0;
  return render(0.12, (t) => {
    // One-pole lowpass that opens then closes with the envelope.
    lp += (noise() - lp) * 0.35;
    const thump = glide(t, 210, 90, 0.12) * 0.6;
    return (lp * 1.6 + thump) * envExp(t, 30) * 0.9;
  });
}

/** Boss hit: deep overdriven impact with a burst of debris noise. */
function boss(): Int16Array {
  const noise = makeNoise();
  let lp = 0;
  return render(0.5, (t) => {
    const sub = glide(t, 130, 38, 0.5);
    lp += (noise() - lp) * 0.18;
    const debris = lp * 2.2 * envExp(t, 24);
    return Math.tanh((sub * envExp(t, 5) + debris) * 2.4) * 0.9;
  });
}

/** Note helper for the jingles: soft triangle-ish partial stack. */
function note(t: number, f: number): number {
  return (
    Math.sin(TWO_PI * f * t) * 0.7 +
    Math.sin(TWO_PI * f * 2 * t) * 0.2 +
    Math.sin(TWO_PI * f * 3 * t) * 0.08
  );
}

/** Win: a happy chorus of quacks, rising, with a long celebratory last one. */
function win(): Int16Array {
  // Staggered flock voices at varied pitches; the finale sits highest.
  const voices: [number, number, number][] = [
    // [start, f0, dur]
    [0.0, 430, 0.17],
    [0.07, 520, 0.16],
    [0.13, 465, 0.18],
    [0.21, 560, 0.16],
    [0.28, 495, 0.18],
    [0.38, 640, 0.3],
  ];
  return render(0.72, (t) => {
    let v = 0;
    for (let i = 0; i < voices.length; i++) {
      const [start, f0, dur] = voices[i];
      v += quack(t - start, f0, dur) * (i === voices.length - 1 ? 0.5 : 0.34);
    }
    return v;
  });
}

/** Gamble gate: slot-machine ticks that swell until the number lands. */
function spin(): Int16Array {
  const dur = 0.75; // Matches CONFIG.juice.gambleSpinSec.
  const period = 1 / 14; // Matches CONFIG.juice.gambleTickHz.
  return render(dur, (t) => {
    const tt = t % period;
    const click =
      Math.sin(TWO_PI * 1900 * tt) * envExp(tt, 260) * 0.5 +
      Math.sin(TWO_PI * 3150 * tt) * envExp(tt, 320) * 0.2;
    return click * (0.45 + 0.55 * (t / dur));
  });
}

/** Lose: three descending wah notes with a sad vibrato. */
function lose(): Int16Array {
  const notes = [392, 329.63, 246.94]; // G4 E4 B3
  const step = 0.19;
  return render(step * 2 + 0.42, (t) => {
    let v = 0;
    for (let i = 0; i < notes.length; i++) {
      const nt = t - i * step;
      if (nt < 0) {
        continue;
      }
      const vib = 1 + 0.02 * Math.sin(TWO_PI * 6.5 * nt);
      const isLast = i === notes.length - 1;
      v += note(nt, notes[i] * vib) * envExp(nt, isLast ? 5.5 : 12) * 0.42;
    }
    return v;
  });
}

/** Coin ping for the win fountain: the classic two-step B5 → E6. */
function coin(): Int16Array {
  return render(0.4, (t) => {
    const f = t < 0.07 ? 987.77 : 1318.51;
    const v = Math.sin(TWO_PI * f * t) + Math.sin(TWO_PI * f * 2 * t) * 0.12;
    return v * envExp(Math.max(0, t - 0.07), 9) * 0.5;
  });
}

function main(): void {
  mkdirSync(OUT_DIR, { recursive: true });
  const sounds: [string, Int16Array][] = [
    ['pop', pop()],
    ['deflate', deflate()],
    ['hit', hit()],
    ['boss', boss()],
    ['spin', spin()],
    ['win', win()],
    ['lose', lose()],
    ['coin', coin()],
  ];
  let total = 0;
  for (const [name, samples] of sounds) {
    const bytes = wav(samples);
    writeFileSync(join(OUT_DIR, `${name}.wav`), bytes);
    total += bytes.length;
    console.log(`${name}.wav`.padEnd(13) + `${(bytes.length / 1024).toFixed(1)} KB`);
  }
  console.log(`total`.padEnd(13) + `${(total / 1024).toFixed(1)} KB (budget 400 KB)`);
  if (total > 400 * 1024) {
    throw new Error('SFX exceed the 400KB budget');
  }
}

main();
