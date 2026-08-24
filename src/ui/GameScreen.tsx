import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { SkCanvas } from '@shopify/react-native-skia';
import { GameCanvas } from '../engine/GameCanvas';
import { playHaptic } from '../engine/haptics';
import { playQuack, playSfx } from '../engine/sfx';
import { clamp } from '../engine/utils';
import { CONFIG } from '../game/config';
import { coinsForClear, startCrowdBonus, unitStrength } from '../game/economy';
import { getLevel } from '../game/levels';
import { createSimState, updateSim } from '../game/sim';
import type { SimEvent } from '../game/types';
import { createRenderCache } from '../render/cache';
import { drawGame } from '../render/drawGame';
import { applyFxEvent, createFxState, fxTimeScale, updateFx } from '../render/fx';
import { createGameFonts } from '../render/fonts';
import { useGameStore } from '../store/gameStore';
import { useProgressStore } from '../store/progressStore';

export function GameScreen() {
  const { width, height } = useWindowDimensions();
  const runId = useGameStore((s) => s.runId);
  const win = useGameStore((s) => s.win);
  const lose = useGameStore((s) => s.lose);
  const levelNumber = useProgressStore((s) => s.level);
  const upgrades = useProgressStore((s) => s.upgrades);
  const addCoins = useProgressStore((s) => s.addCoins);

  const level = useMemo(() => {
    const base = getLevel(levelNumber);
    return { ...base, startCount: base.startCount + startCrowdBonus(upgrades) };
  }, [levelNumber, upgrades]);
  // Each retry rerolls the gamble gates: the attempt seed mixes the level
  // seed with the run token (deterministic headless runs pass their own).
  const simOptions = useMemo(
    () => ({
      unitStrength: unitStrength(upgrades),
      gambleSeed: (level.seed * 49297 + runId * 233280 + 1) >>> 0,
    }),
    [upgrades, level.seed, runId]
  );
  const fonts = useMemo(() => createGameFonts(), []);
  const cache = useMemo(() => createRenderCache(), []);
  const sim = useRef(createSimState(level, simOptions));
  const fx = useRef(createFxState());
  const steerX = useRef(0);
  const paused = useRef(false);

  useEffect(() => {
    // Retry / next level: rebuild sim and juice state, unpause.
    sim.current = createSimState(level, simOptions);
    fx.current = createFxState();
    steerX.current = 0;
    paused.current = false;
  }, [runId, level, simOptions]);

  const onSimEvent = useCallback(
    (ev: SimEvent) => {
      const s = sim.current;
      applyFxEvent(fx.current, ev, s, width, height);
      playHaptic(ev.kind);
      switch (ev.kind) {
        case 'gateGood':
          playSfx('pop');
          playQuack();
          break;
        case 'gateBad':
          playSfx('womp');
          playSfx('peep');
          break;
        case 'gambleWin':
        case 'gambleLose':
          // The roll's reveal waits for the slot spin; onUpdate plays the
          // result sound when the fx layer lands it.
          playSfx('ratchet');
          break;
        case 'enemyHit':
          playSfx('peep');
          break;
        case 'bossHit':
          playSfx('thud');
          break;
        case 'drained':
          break;
        case 'won':
          playSfx('chorus');
          playSfx('coins');
          break;
        case 'lost':
          playSfx('snap');
          playSfx('descend');
          break;
      }
    },
    [width, height]
  );

  const onUpdate = useCallback(
    (dt: number) => {
      const s = sim.current;
      const f = fx.current;
      if (s.phase !== 'won' && s.phase !== 'lost') {
        s.targetX = steerX.current;
        // Boss-hit slow-mo scales the sim step; the juice clocks below run on
        // real time so the slow-mo itself lasts its configured wall-clock span.
        updateSim(s, dt * fxTimeScale(f));
        for (let i = 0; i < s.events.length; i++) {
          onSimEvent(s.events[i]);
        }
        s.events.length = 0;
      }
      updateFx(f, dt, s, width, height);

      // Gamble spin just landed: reveal with the matching sound and haptic.
      if (f.gambleLanded) {
        playSfx(f.gambleGood ? 'ding' : 'buzz');
        playHaptic(f.gambleGood ? 'gateGood' : 'gateBad');
      }

      // Let the celebration/defeat animation play before the result overlay.
      if ((s.phase === 'won' || s.phase === 'lost') && !f.resultShown) {
        const delay =
          s.phase === 'won'
            ? CONFIG.juice.winOverlayDelaySec
            : CONFIG.juice.loseOverlayDelaySec;
        if (f.phaseTime >= delay) {
          f.resultShown = true;
          paused.current = true;
          if (s.phase === 'won') {
            const coins = coinsForClear(s.boss.count, s.count, upgrades);
            addCoins(coins);
            win(coins);
          } else {
            lose();
          }
        }
      }
    },
    [onSimEvent, win, lose, addCoins, upgrades, width, height]
  );

  const onRender = useCallback(
    (canvas: SkCanvas, w: number, h: number, alpha: number) => {
      drawGame(canvas, sim.current, fx.current, w, h, alpha, fonts, cache);
    },
    [fonts, cache]
  );

  // Drag steering: horizontal finger travel moves the crowd centre across the
  // lane. Relative drag, so the thumb can rest anywhere on the screen. The
  // capture-phase responder claims the gesture before any child view can.
  const lastTouchX = useRef(0);
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: (e) => {
          lastTouchX.current = e.nativeEvent.pageX;
        },
        onPanResponderMove: (e) => {
          const dx = e.nativeEvent.pageX - lastTouchX.current;
          lastTouchX.current = e.nativeEvent.pageX;
          const laneHalfPx = width * CONFIG.lane.bottomHalfWidthFrac;
          steerX.current = clamp(
            steerX.current + (dx / laneHalfPx) * CONFIG.run.steerSensitivity,
            -CONFIG.run.maxCrowdX,
            CONFIG.run.maxCrowdX
          );
        },
      }),
    [width]
  );

  return (
    <View style={styles.fill} {...panResponder.panHandlers}>
      <View style={styles.fill} pointerEvents="none">
        <GameCanvas onUpdate={onUpdate} onRender={onRender} paused={paused} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    // Matches the top of the in-game sky gradient so there is no colour pop
    // before the first frame is recorded.
    backgroundColor: CONFIG.colors.skyTop,
  },
});
