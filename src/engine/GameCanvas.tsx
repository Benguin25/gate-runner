import React, { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import {
  Canvas,
  Picture,
  Skia,
  createPicture,
  type SkCanvas,
  type SkPicture,
} from '@shopify/react-native-skia';
import { useSharedValue } from 'react-native-reanimated';
import { CONFIG } from '../game/config';

// The game loop: fixed 60hz update with an accumulator, interpolated render.
// Each frame is recorded into an SkPicture and handed to the Canvas through a
// shared value, so no React re-renders happen per frame. The loop runs on the
// JS thread — creating Skia objects inside UI-thread worklets crashes Expo Go
// on iOS, and at this scene size the JS thread holds 60fps comfortably.

export interface GameCanvasProps {
  /** Called zero or more times per frame with the fixed timestep. */
  onUpdate: (dt: number) => void;
  /** Called once per frame; alpha in [0, 1) interpolates between steps. */
  onRender: (canvas: SkCanvas, width: number, height: number, alpha: number) => void;
  /** Set .current to true to freeze the loop (state and last frame persist). */
  paused: React.MutableRefObject<boolean>;
}

export function GameCanvas({ onUpdate, onRender, paused }: GameCanvasProps) {
  const { width, height } = useWindowDimensions();
  const picture = useSharedValue<SkPicture>(createPicture(() => {}));

  useEffect(() => {
    const E = CONFIG.engine;
    let rafId = 0;
    let lastMs: number | null = null;
    let accumulator = 0;

    const frame = (nowMs: number) => {
      rafId = requestAnimationFrame(frame);
      if (paused.current) {
        lastMs = nowMs;
        return;
      }
      const deltaSec = Math.min(
        lastMs === null ? E.fixedStep : (nowMs - lastMs) / 1000,
        E.maxFrameDeltaSec
      );
      lastMs = nowMs;

      accumulator += deltaSec;
      let steps = 0;
      while (accumulator >= E.fixedStep && steps < E.maxStepsPerFrame) {
        onUpdate(E.fixedStep);
        accumulator -= E.fixedStep;
        steps++;
      }
      if (steps === E.maxStepsPerFrame) {
        accumulator = 0;
      }

      const recorder = Skia.PictureRecorder();
      const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
      onRender(canvas, width, height, accumulator / E.fixedStep);
      picture.value = recorder.finishRecordingAsPicture();
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [width, height, onUpdate, onRender, paused, picture]);

  return (
    <Canvas style={{ flex: 1 }}>
      <Picture picture={picture} />
    </Canvas>
  );
}
