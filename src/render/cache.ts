import {
  PaintStyle,
  Skia,
  StrokeCap,
  StrokeJoin,
  TileMode,
  vec,
  type SkFont,
  type SkPaint,
  type SkPath,
  type SkRect,
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
  /** Full-width band from the horizon to the bottom; grass under everything. */
  grassRect: SkRect;
  /** Pond strip hugging the left screen edge (drawn over grass, under lane). */
  pond: SkPath;
  /** Soft light highlight lines just inside each lane edge. */
  leftHighlight: SkPath;
  rightHighlight: SkPath;
}

export class RenderCache {
  private paints = new Map<ColorName, SkPaint>();
  private strokes = new Map<ColorName, SkPaint>();
  private lane: LaneGeometry | null = null;
  private textWidths = new Map<SkFont, Map<string, number>>();
  private scratch: SkPath[] = [];
  private sky: { w: number; h: number; paint: SkPaint } | null = null;
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

  /**
   * Reusable stroke paint for a config colour (rounded joins so outlined
   * text stays chunky, not spiky). Callers set the width and alpha they
   * need and must reset alpha to 1 when done, like paint().
   */
  strokePaint(name: ColorName): SkPaint {
    let p = this.strokes.get(name);
    if (!p) {
      p = Skia.Paint();
      p.setColor(Skia.Color(CONFIG.colors[name]));
      p.setStyle(PaintStyle.Stroke);
      p.setStrokeJoin(StrokeJoin.Round);
      p.setStrokeCap(StrokeCap.Round);
      this.strokes.set(name, p);
    }
    return p;
  }

  /** Sky gradient paint (light blue to warm horizon), rebuilt on resize. */
  skyPaint(w: number, h: number): SkPaint {
    if (this.sky && this.sky.w === w && this.sky.h === h) {
      return this.sky.paint;
    }
    const paint = Skia.Paint();
    paint.setShader(
      Skia.Shader.MakeLinearGradient(
        vec(0, 0),
        vec(0, h * CONFIG.lane.horizonYFrac * CONFIG.visual.skyBandFrac),
        [Skia.Color(CONFIG.colors.skyTop), Skia.Color(CONFIG.colors.skyHorizon)],
        null,
        TileMode.Clamp
      )
    );
    this.sky = { w, h, paint };
    return paint;
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

    const grassRect = Skia.XYWHRect(0, horizonY, w, h - horizonY);

    // Pond quad along the left screen edge, narrowing toward the horizon.
    // The lane surface draws over it, so only the upper-left sliver shows.
    const V = CONFIG.visual;
    const pond = Skia.Path.Make();
    pond.moveTo(0, h);
    pond.lineTo(w * V.pondBottomWidthFrac, h);
    pond.lineTo(w * V.pondTopWidthFrac, horizonY);
    pond.lineTo(0, horizonY);
    pond.close();

    // Soft light lines just inside each lane edge; the inset shrinks toward
    // the horizon with the fake perspective.
    const inset = V.edgeHighlightInsetPx;
    const topInset = inset * CONFIG.lane.minScale;
    const leftHighlight = Skia.Path.Make();
    leftHighlight.moveTo(cx - halfBottom + inset, h);
    leftHighlight.lineTo(cx - halfTop + topInset, horizonY);
    const rightHighlight = Skia.Path.Make();
    rightHighlight.moveTo(cx + halfBottom - inset, h);
    rightHighlight.lineTo(cx + halfTop - topInset, horizonY);

    this.lane = {
      w,
      h,
      surface,
      leftEdge,
      rightEdge,
      grassRect,
      pond,
      leftHighlight,
      rightHighlight,
    };
    return this.lane;
  }

  /**
   * A shared scratch path per slot, reset on every call. Used for per-frame
   * batched geometry (outlines, bodies, beaks, eyes) so the hot loop makes no
   * allocations. Callers that need several live paths at once take distinct
   * slots; a slot is safe to reuse once its previous contents are drawn.
   */
  scratchPath(slot = 0): SkPath {
    let p = this.scratch[slot];
    if (!p) {
      p = Skia.Path.Make();
      this.scratch[slot] = p;
    }
    p.reset();
    return p;
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
