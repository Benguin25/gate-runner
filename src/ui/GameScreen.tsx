import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import type { SkCanvas } from '@shopify/react-native-skia';
import { runOnJS, useSharedValue } from 'react-native-reanimated';
import { GameCanvas } from '../engine/GameCanvas';
import { clamp } from '../engine/utils';
import { CONFIG } from '../game/config';
import { getLevel } from '../game/levels';
import { createSimState, updateSim } from '../game/sim';
import type { SimState } from '../game/types';
import { drawGame } from '../render/drawGame';
import { createGameFonts } from '../render/fonts';
import { useGameStore, type GamePhase } from '../store/gameStore';

export function GameScreen() {
  const { width } = useWindowDimensions();
  const runId = useGameStore((s) => s.runId);
  const setPhase = useGameStore((s) => s.setPhase);

  const level = useMemo(() => getLevel(1), []);
  const fonts = useMemo(() => createGameFonts(), []);
  const sim = useSharedValue<SimState>(createSimState(level));
  const steerX = useSharedValue(0);
  const paused = useSharedValue(false);

  useEffect(() => {
    // Retry: rebuild the sim from the level definition and unpause.
    sim.value = createSimState(level);
    steerX.value = 0;
    paused.value = false;
  }, [runId, level, sim, steerX, paused]);

  const reportPhase = useCallback(
    (phase: GamePhase) => {
      setPhase(phase);
    },
    [setPhase]
  );

  const onUpdate = (dt: number) => {
    'worklet';
    const s = sim.value;
    if (s.phase === 'won' || s.phase === 'lost') {
      return;
    }
    s.targetX = steerX.value;
    const phase = updateSim(s, dt);
    if (phase === 'won' || phase === 'lost') {
      paused.value = true;
      runOnJS(reportPhase)(phase);
    }
  };

  const onRender = (canvas: SkCanvas, w: number, h: number, alpha: number) => {
    'worklet';
    drawGame(canvas, sim.value, w, h, alpha, fonts);
  };

  // Drag steering: horizontal finger travel moves the crowd centre across the
  // lane. Relative drag, so the thumb can rest anywhere on the screen.
  const lastTouchX = useRef(0);
  const onTouchStart = useCallback((e: GestureResponderEvent) => {
    lastTouchX.current = e.nativeEvent.pageX;
  }, []);
  const onTouchMove = useCallback(
    (e: GestureResponderEvent) => {
      const dx = e.nativeEvent.pageX - lastTouchX.current;
      lastTouchX.current = e.nativeEvent.pageX;
      const laneHalfPx = width * CONFIG.lane.bottomHalfWidthFrac;
      steerX.value = clamp(
        steerX.value + (dx / laneHalfPx) * CONFIG.run.steerSensitivity,
        -CONFIG.run.maxCrowdX,
        CONFIG.run.maxCrowdX
      );
    },
    [width, steerX]
  );

  return (
    <View style={styles.fill} onTouchStart={onTouchStart} onTouchMove={onTouchMove}>
      <GameCanvas onUpdate={onUpdate} onRender={onRender} paused={paused} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: CONFIG.colors.bg,
  },
});
