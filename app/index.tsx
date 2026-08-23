import React from 'react';
import { View } from 'react-native';
import { GameScreen } from '../src/ui/GameScreen';
import { ResultOverlay } from '../src/ui/Overlays';

export default function Game() {
  return (
    <View style={{ flex: 1 }}>
      <GameScreen />
      <ResultOverlay />
    </View>
  );
}
