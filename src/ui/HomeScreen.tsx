import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CONFIG } from '../game/config';
import { useProgressStore } from '../store/progressStore';

// Home: current level, coin balance, play and shop.

export function HomeScreen() {
  const router = useRouter();
  const level = useProgressStore((s) => s.level);
  const coins = useProgressStore((s) => s.coins);

  return (
    <View style={styles.fill}>
      <View style={styles.coinsRow}>
        <View style={styles.coinDot} />
        <Text style={styles.coinsText}>{coins}</Text>
      </View>
      <Text style={styles.title}>GATE RUNNER</Text>
      <Text style={styles.levelLabel}>LEVEL {level}</Text>
      <Pressable
        style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
        onPress={() => router.push('/game')}
      >
        <Text style={styles.playText}>PLAY</Text>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.shopButton, pressed && styles.pressed]}
        onPress={() => router.push('/shop')}
      >
        <Text style={styles.shopText}>SHOP</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: CONFIG.colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinsRow: {
    position: 'absolute',
    top: 64,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  coinDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: CONFIG.colors.coin,
    marginRight: 8,
  },
  coinsText: {
    color: CONFIG.colors.coin,
    fontSize: 20,
    fontWeight: 'bold',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginBottom: 10,
  },
  levelLabel: {
    color: '#94A3B8',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginBottom: 48,
  },
  playButton: {
    backgroundColor: CONFIG.colors.button,
    paddingHorizontal: 64,
    paddingVertical: 20,
    borderRadius: 999,
    marginBottom: 16,
    minWidth: 240,
    alignItems: 'center',
  },
  playText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  shopButton: {
    backgroundColor: '#334155',
    paddingHorizontal: 64,
    paddingVertical: 16,
    borderRadius: 999,
    minWidth: 240,
    alignItems: 'center',
  },
  shopText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  pressed: {
    opacity: 0.8,
  },
});
