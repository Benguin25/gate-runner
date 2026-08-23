import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CONFIG } from '../game/config';
import {
  incomeMultiplier,
  startCrowdBonus,
  unitStrength,
  upgradeCost,
  type UpgradeId,
  type UpgradeTiers,
} from '../game/economy';
import { useProgressStore } from '../store/progressStore';

// Shop: three upgrade cards. Costs follow the config curves; buying is
// disabled when the balance can't cover the next tier.

interface CardInfo {
  id: UpgradeId;
  title: string;
  describe: (tiers: UpgradeTiers) => string;
}

const CARDS: CardInfo[] = [
  {
    id: 'startCrowd',
    title: 'STARTING CROWD',
    describe: (t) => `Start with ${CONFIG.crowd.startCount + startCrowdBonus(t)} units (+1 per tier)`,
  },
  {
    id: 'income',
    title: 'INCOME',
    describe: (t) => `${Math.round(incomeMultiplier(t) * 100)}% coins (+10% per tier)`,
  },
  {
    id: 'strength',
    title: 'UNIT STRENGTH',
    describe: (t) => `Each unit counts ${unitStrength(t).toFixed(2)}x vs boss (x1.1 per tier)`,
  },
];

export function ShopScreen() {
  const router = useRouter();
  const coins = useProgressStore((s) => s.coins);
  const upgrades = useProgressStore((s) => s.upgrades);
  const buyUpgrade = useProgressStore((s) => s.buyUpgrade);

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>{'<'} BACK</Text>
        </Pressable>
        <Text style={styles.title}>SHOP</Text>
        <View style={styles.coinsRow}>
          <View style={styles.coinDot} />
          <Text style={styles.coinsText}>{coins}</Text>
        </View>
      </View>
      {CARDS.map((card) => {
        const tier = upgrades[card.id];
        const cost = upgradeCost(card.id, tier);
        const affordable = coins >= cost;
        return (
          <View key={card.id} style={styles.card}>
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle}>{card.title}</Text>
              <Text style={styles.cardTier}>TIER {tier}</Text>
            </View>
            <Text style={styles.cardDesc}>{card.describe(upgrades)}</Text>
            <Pressable
              disabled={!affordable}
              style={({ pressed }) => [
                styles.buyButton,
                !affordable && styles.buyDisabled,
                pressed && styles.pressed,
              ]}
              onPress={() => buyUpgrade(card.id)}
            >
              <View style={styles.buyCoinDot} />
              <Text style={styles.buyText}>{cost}</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: CONFIG.colors.bg,
    paddingTop: 72,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  backButton: {
    paddingVertical: 8,
    paddingRight: 12,
  },
  backText: {
    color: '#94A3B8',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  coinsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  coinDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: CONFIG.colors.bossCrown,
    marginRight: 8,
  },
  coinsText: {
    color: CONFIG.colors.bossCrown,
    fontSize: 20,
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: '#1E293B',
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  cardTier: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  cardDesc: {
    color: '#CBD5E1',
    fontSize: 15,
    marginBottom: 16,
  },
  buyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CONFIG.colors.goodGate,
    paddingVertical: 12,
    borderRadius: 999,
  },
  buyDisabled: {
    backgroundColor: '#334155',
    opacity: 0.6,
  },
  buyCoinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: CONFIG.colors.bossCrown,
    marginRight: 8,
  },
  buyText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  pressed: {
    opacity: 0.8,
  },
});
