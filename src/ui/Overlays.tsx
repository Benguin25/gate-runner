import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CONFIG } from '../game/config';
import { useGameStore } from '../store/gameStore';

// Minimal win / fail overlays. Coins, ads and "next level" arrive in later
// milestones; for now both outcomes offer a retry of the same level.

export function ResultOverlay() {
  const phase = useGameStore((s) => s.phase);
  const retry = useGameStore((s) => s.retry);
  if (phase === 'playing') {
    return null;
  }
  const won = phase === 'won';
  return (
    <View style={styles.fill}>
      <Text style={[styles.title, { color: won ? CONFIG.colors.goodGate : CONFIG.colors.badGate }]}>
        {won ? 'LEVEL CLEAR!' : 'TRY AGAIN'}
      </Text>
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={retry}
      >
        <Text style={styles.buttonText}>{won ? 'PLAY AGAIN' : 'RETRY'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
  },
  title: {
    fontSize: 40,
    fontWeight: 'bold',
    marginBottom: 32,
    letterSpacing: 1,
  },
  button: {
    backgroundColor: CONFIG.colors.crowd,
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 999,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
});
