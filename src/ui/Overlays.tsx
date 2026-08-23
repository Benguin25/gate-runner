import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CONFIG } from '../game/config';
import { useGameStore } from '../store/gameStore';
import { useProgressStore } from '../store/progressStore';

// Level-clear and level-fail screens, shown over the game canvas. Clearing
// shows the coins earned and advances; failing offers a retry of the same
// level. (Ad buttons arrive with milestone 7.)

export function ResultOverlay() {
  const phase = useGameStore((s) => s.phase);
  const coinsEarned = useGameStore((s) => s.coinsEarned);
  const newRun = useGameStore((s) => s.newRun);
  const level = useProgressStore((s) => s.level);
  const advanceLevel = useProgressStore((s) => s.advanceLevel);
  const router = useRouter();

  if (phase === 'playing') {
    return null;
  }
  const won = phase === 'won';

  const onPrimary = () => {
    if (won) {
      advanceLevel();
    }
    newRun();
  };
  const onHome = () => {
    if (won) {
      advanceLevel();
    }
    router.back();
  };

  return (
    <View style={styles.fill}>
      <Text style={styles.levelLabel}>LEVEL {level}</Text>
      <Text style={[styles.title, { color: won ? CONFIG.colors.goodGate : CONFIG.colors.badGate }]}>
        {won ? 'LEVEL CLEAR!' : 'TRY AGAIN'}
      </Text>
      {won && (
        <View style={styles.coinsRow}>
          <View style={styles.coinDot} />
          <Text style={styles.coinsText}>+{coinsEarned}</Text>
        </View>
      )}
      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={onPrimary}
      >
        <Text style={styles.buttonText}>{won ? 'NEXT' : 'RETRY'}</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.button, styles.secondaryButton, pressed && styles.buttonPressed]}
        onPress={onHome}
      >
        <Text style={styles.buttonText}>HOME</Text>
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
  levelLabel: {
    color: '#94A3B8',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginBottom: 8,
  },
  title: {
    fontSize: 40,
    fontWeight: 'bold',
    marginBottom: 20,
    letterSpacing: 1,
  },
  coinsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 28,
  },
  coinDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: CONFIG.colors.bossCrown,
    marginRight: 10,
  },
  coinsText: {
    color: CONFIG.colors.bossCrown,
    fontSize: 28,
    fontWeight: 'bold',
  },
  button: {
    backgroundColor: CONFIG.colors.crowd,
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 999,
    marginBottom: 14,
    minWidth: 220,
    alignItems: 'center',
  },
  secondaryButton: {
    backgroundColor: '#334155',
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
