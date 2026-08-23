import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import type { SkCanvas } from '@shopify/react-native-skia';
import { GameCanvas } from '../engine/GameCanvas';
import { clamp } from '../engine/utils';
import { CONFIG } from '../game/config';
import { getLevel } from '../game/levels';
import { createSimState, updateSim } from '../game/sim';
import { drawGame } from '../render/drawGame';
import { createGameFonts } from '../render/fonts';
import { useGameStore } from '../store/gameStore';

export function GameScreen() {
  const { width } = useWindowDimensions();
  const runId = useGameStore((s) => s.runId);
  const setPhase = useGameStore((s) => s.setPhase);

  const level = useMemo(() => getLevel(1), []);
  const fonts = useMemo(() => createGameFonts(), []);
  const sim = useRef(createSimState(level));
  const steerX = useRef(0);
  const paused = useRef(false);

  useEffect(() => {
    // Retry: rebuild the sim from the level definition and unpause.
    sim.current = createSimState(level);
    steerX.current = 0;
    paused.current = false;
  }, [runId, level]);

  const onUpdate = useCallback(
    (dt: number) => {
      const s = sim.current;
      if (s.phase === 'won' || s.phase === 'lost') {
        return;
      }
      s.targetX = steerX.current;
      const phase = updateSim(s, dt);
      if (phase === 'won' || phase === 'lost') {
        paused.current = true;
        setPhase(phase);
      }
    },
    [setPhase]
  );

  const onRender = useCallback(
    (canvas: SkCanvas, w: number, h: number, alpha: number) => {
      drawGame(canvas, sim.current, w, h, alpha, fonts);
    },
    [fonts]
  );

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
      steerX.current = clamp(
        steerX.current + (dx / laneHalfPx) * CONFIG.run.steerSensitivity,
        -CONFIG.run.maxCrowdX,
        CONFIG.run.maxCrowdX
      );
    },
    [width]
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
