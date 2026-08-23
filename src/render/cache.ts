import {
  PaintStyle,
  Skia,
  type SkFont,
  type SkPaint,
  type SkPath,
} from '@shopify/react-native-skia';
import { CONFIG } from '../game/config';
import { lerp } from '../engine/utils';

// Long-lived render objects. Profiling the 300-unit frame showed ~840
// setColor calls per frame, each parsing a '#RRGGBB' string, plus fresh
// Paint/Path allocations every frame — all JSI hops into native Skia. Colours
// are parsed once, paints are created once per colour and reused, and the
// static lane geometry is rebuilt only when the canvas size changes.

export type ColorName = keyof typeof CONFIG.colors;

export interface LaneGeometry {
  w: number;
  h: number;
  surface: SkPath;
  leftEdge: SkPath;
  rightEdge: SkPath;
}

export class RenderCache {
  private paints = new Map<ColorName, SkPaint>();
  private lane: LaneGeometry | null = null;
  private textWidths = new Map<SkFont, Map<string, number>>();
  private slots: SkPath | null = null;
  private scratch: SkPath | null = null;
  /** Stroke paint for the lane edges. */
  readonly edgePaint: SkPaint;

  constructor() {
    this.edgePaint = Skia.Paint();
    this.edgePaint.setColor(Skia.Color(CONFIG.colors.laneEdge));
    this.edgePaint.setStyle(PaintStyle.Stroke);
    this.edgePaint.setStrokeWidth(3);
  }

  /**
   * Reusable fill paint for a config colour. Callers that change its alpha
   * must reset it to 1 when done, so the next user sees a clean paint.
   */
  paint(name: ColorName): SkPaint {
    let p = this.paints.get(name);
    if (!p) {
      p = Skia.Paint();
      p.setColor(Skia.Color(CONFIG.colors[name]));
      this.paints.set(name, p);
    }
    return p;
  }

  /** Static lane surface and edge paths, rebuilt only on canvas resize. */
  laneGeometry(w: number, h: number): LaneGeometry {
    if (this.lane && this.lane.w === w && this.lane.h === h) {
      return this.lane;
    }
    const L = CONFIG.lane;
    const cx = w / 2;
    const horizonY = h * L.horizonYFrac;
    // Extend the lane past the crowd row to the bottom of the screen by
    // inverting the projection at y = h.
    const pBottom = (h - h * L.crowdYFrac) / (horizonY - h * L.crowdYFrac);
    const halfBottom = w * lerp(L.bottomHalfWidthFrac, L.topHalfWidthFrac, pBottom);
    const halfTop = w * L.topHalfWidthFrac;

    const surface = Skia.Path.Make();
    surface.moveTo(cx - halfBottom, h);
    surface.lineTo(cx + halfBottom, h);
    surface.lineTo(cx + halfTop, horizonY);
    surface.lineTo(cx - halfTop, horizonY);
    surface.close();

    const leftEdge = Skia.Path.Make();
    leftEdge.moveTo(cx - halfBottom, h);
    leftEdge.lineTo(cx - halfTop, horizonY);
    const rightEdge = Skia.Path.Make();
    rightEdge.moveTo(cx + halfBottom, h);
    rightEdge.lineTo(cx + halfTop, horizonY);

    this.lane = { w, h, surface, leftEdge, rightEdge };
    return this.lane;
  }

  /**
   * The storm drain's slot bars (dark horizontal grate openings) in
   * drain-local units; geometry only depends on config, so it is built once.
   */
  drainSlotsPath(): SkPath {
    if (this.slots) {
      return this.slots;
    }
    const B = CONFIG.boss;
    const R = B.bodyRadiusPx * (1 - B.rimFrac);
    const slots = Skia.Path.Make();
    const slotH = B.bodyRadiusPx * B.slotHeightFrac;
    for (let k = 0; k < B.slotCount; k++) {
      // Bars spread evenly across the grate, shorter toward the edges.
      const fy = (k + 0.5) / B.slotCount - 0.5;
      const y = fy * 2 * R * 0.8;
      const halfW = Math.sqrt(Math.max(0.15, 1 - fy * fy * 2.6)) * R * B.slotWidthFrac * 0.5;
      slots.addRRect(
        Skia.RRectXY(Skia.XYWHRect(-halfW, y - slotH / 2, halfW * 2, slotH), slotH / 2, slotH / 2)
      );
    }
    this.slots = slots;
    return slots;
  }

  /**
   * A shared scratch path, reset on every call. Used for per-frame batched
   * geometry (all the duckling beaks) so the hot loop makes no allocations.
   */
  scratchPath(): SkPath {
    if (!this.scratch) {
      this.scratch = Skia.Path.Make();
    }
    this.scratch.reset();
    return this.scratch;
  }

  /** Memoized text width — labels repeat for many frames between changes. */
  textWidth(font: SkFont, text: string): number {
    let widths = this.textWidths.get(font);
    if (!widths) {
      widths = new Map();
      this.textWidths.set(font, widths);
    }
    let width = widths.get(text);
    if (width === undefined) {
      width = font.measureText(text).width;
      // Labels are short-lived numbers; keep the memo from growing forever.
      if (widths.size > 512) {
        widths.clear();
      }
      widths.set(text, width);
    }
    return width;
  }
}

export function createRenderCache(): RenderCache {
  return new RenderCache();
}
