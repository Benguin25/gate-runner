// Headless stand-in for @shopify/react-native-skia used by scripts/profile.ts
// (wired up via the paths mapping in scripts/tsconfig.profile.json). It mimics
// the JS-visible work of the real module — hex colour parsing, object
// allocation per Paint/Path, a little float math per draw call — and counts
// allocations and draw calls so the profiler can report both time and call
// volume per frame. It is NOT part of the app bundle.

export const PaintStyle = { Fill: 0, Stroke: 1 } as const;

export interface MockStats {
  paints: number;
  paths: number;
  colorParses: number;
  setColors: number;
  drawCalls: number;
}

export const stats: MockStats = {
  paints: 0,
  paths: 0,
  colorParses: 0,
  setColors: 0,
  drawCalls: 0,
};

export function resetStats(): void {
  stats.paints = 0;
  stats.paths = 0;
  stats.colorParses = 0;
  stats.setColors = 0;
  stats.drawCalls = 0;
}

// Accumulator the mock writes into so the JIT cannot dead-code-eliminate the
// per-call work.
export let sink = 0;

class MockPaint {
  color: Float32Array = new Float32Array(4);
  alpha = 1;
  style = 0;
  strokeWidth = 1;
  constructor() {
    stats.paints++;
  }
  setColor(c: Float32Array): void {
    stats.setColors++;
    this.color = c;
  }
  setAlphaf(a: number): void {
    this.alpha = a;
  }
  setStyle(s: number): void {
    this.style = s;
  }
  setStrokeWidth(w: number): void {
    this.strokeWidth = w;
  }
}

class MockPath {
  commands: number[] = [];
  constructor() {
    stats.paths++;
  }
  moveTo(x: number, y: number): void {
    this.commands.push(0, x, y);
  }
  lineTo(x: number, y: number): void {
    this.commands.push(1, x, y);
  }
  addRect(r: number[]): void {
    this.commands.push(2, r[0], r[1], r[2], r[3]);
  }
  close(): void {
    this.commands.push(3);
  }
}

function draw(...nums: number[]): void {
  stats.drawCalls++;
  let acc = 0;
  for (let i = 0; i < nums.length; i++) {
    acc += nums[i];
  }
  sink += acc;
}

class MockCanvas {
  drawRect(r: number[], p: MockPaint): void {
    draw(r[0], r[1], r[2], r[3], p.alpha);
  }
  drawRRect(r: { rect: number[]; rx: number }, p: MockPaint): void {
    draw(r.rect[0], r.rect[1], r.rect[2], r.rect[3], r.rx, p.alpha);
  }
  drawCircle(x: number, y: number, r: number, p: MockPaint): void {
    draw(x, y, r, p.alpha);
  }
  drawPath(path: MockPath, p: MockPaint): void {
    draw(path.commands.length, p.alpha);
  }
  drawText(text: string, x: number, y: number, _p: MockPaint, _f: unknown): void {
    draw(text.length, x, y);
  }
  save(): void {}
  restore(): void {}
  translate(_x: number, _y: number): void {}
  scale(_x: number, _y: number): void {}
  rotate(_deg: number, _x: number, _y: number): void {}
}

// Hex colour parsing comparable to what Skia.Color does with a '#RRGGBB' string.
function parseColor(color: string): Float32Array {
  stats.colorParses++;
  const out = new Float32Array(4);
  const hex = color.slice(1);
  out[0] = parseInt(hex.slice(0, 2), 16) / 255;
  out[1] = parseInt(hex.slice(2, 4), 16) / 255;
  out[2] = parseInt(hex.slice(4, 6), 16) / 255;
  out[3] = 1;
  return out;
}

export const Skia = {
  Paint: () => new MockPaint(),
  Color: (c: string) => parseColor(c),
  Path: { Make: () => new MockPath() },
  XYWHRect: (x: number, y: number, w: number, h: number) => [x, y, w, h],
  RRectXY: (rect: number[], rx: number, ry: number) => ({ rect, rx, ry }),
};

export function makeCanvas(): MockCanvas {
  return new MockCanvas();
}

export function makeFont(): { measureText: (t: string) => { width: number } } {
  return { measureText: (t: string) => ({ width: t.length * 18 }) };
}

// Type-only re-exports used by the app code under test.
export type SkCanvas = MockCanvas;
export type SkPaint = MockPaint;
export type SkFont = ReturnType<typeof makeFont>;
