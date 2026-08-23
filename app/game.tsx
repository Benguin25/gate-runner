import React, { useEffect } from 'react';
import { View } from 'react-native';
import { GameScreen } from '../src/ui/GameScreen';
import { ResultOverlay } from '../src/ui/Overlays';
import { useGameStore } from '../src/store/gameStore';

export default function Game() {
  // Entering the game route always starts a fresh run of the current level.
  useEffect(() => {
    useGameStore.getState().newRun();
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <GameScreen />
      <ResultOverlay />
    </View>
  );
}
