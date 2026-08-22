import React from 'react';
import { useWindowDimensions } from 'react-native';
import {
  Canvas,
  Picture,
  Skia,
  createPicture,
  type SkCanvas,
  type SkPicture,
} from '@shopify/react-native-skia';
import {
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { CONFIG } from '../game/config';

// The game loop. Drives a fixed 60hz simulation from useFrameCallback with an
// accumulator, then records the frame into an SkPicture on the UI thread —
// no per-frame React re-renders. onUpdate and onRender must be worklets.

export interface GameCanvasProps {
  /** Called zero or more times per frame with the fixed timestep. */
  onUpdate: (dt: number) => void;
  /** Called once per frame; alpha in [0, 1) interpolates between steps. */
  onRender: (canvas: SkCanvas, width: number, height: number, alpha: number) => void;
  paused: SharedValue<boolean>;
}

export function GameCanvas({ onUpdate, onRender, paused }: GameCanvasProps) {
  const { width, height } = useWindowDimensions();
  const picture = useSharedValue<SkPicture>(createPicture(() => {}));
  const accumulator = useSharedValue(0);

  useFrameCallback((frame) => {
    if (paused.value) {
      return;
    }
    const E = CONFIG.engine;
    const deltaSec = Math.min(
      (frame.timeSincePreviousFrame ?? E.fixedStep * 1000) / 1000,
      E.maxFrameDeltaSec
    );
    accumulator.value += deltaSec;
    let steps = 0;
    while (accumulator.value >= E.fixedStep && steps < E.maxStepsPerFrame) {
      onUpdate(E.fixedStep);
      accumulator.value -= E.fixedStep;
      steps++;
    }
    if (steps === E.maxStepsPerFrame) {
      accumulator.value = 0;
    }
    const alpha = accumulator.value / E.fixedStep;

    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, width, height));
    onRender(canvas, width, height, alpha);
    picture.value = recorder.finishRecordingAsPicture();
  });

  return (
    <Canvas style={{ flex: 1 }}>
      <Picture picture={picture} />
    </Canvas>
  );
}
