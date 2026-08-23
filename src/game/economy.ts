import { CONFIG } from './config';

// Coin awards and the three-upgrade shop. Pure functions shared by the store,
// the shop UI and the level-clear overlay.

export type UpgradeId = 'startCrowd' | 'income' | 'strength';

export const UPGRADE_IDS: readonly UpgradeId[] = ['startCrowd', 'income', 'strength'];

export interface UpgradeTiers {
  startCrowd: number;
  income: number;
  strength: number;
}

export const ZERO_UPGRADES: UpgradeTiers = { startCrowd: 0, income: 0, strength: 0 };

/** Cost of buying the next tier when `tier` tiers are already owned. */
export function upgradeCost(id: UpgradeId, tier: number): number {
  const u = CONFIG.economy.upgrades[id];
  return Math.round(u.baseCost * Math.pow(u.costGrowth, tier));
}

/** Extra starting units from the start-crowd upgrade. */
export function startCrowdBonus(tiers: UpgradeTiers): number {
  return tiers.startCrowd * CONFIG.economy.upgrades.startCrowd.bonusPerTier;
}

/** Coin multiplier from the income upgrade (+10% per tier). */
export function incomeMultiplier(tiers: UpgradeTiers): number {
  return 1 + tiers.income * CONFIG.economy.upgrades.income.bonusPerTier;
}

/** Per-unit boss-fight strength from the strength upgrade (1.1x per tier). */
export function unitStrength(tiers: UpgradeTiers): number {
  return Math.pow(CONFIG.economy.upgrades.strength.factorPerTier, tiers.strength);
}

/** Coins awarded for clearing a level: boss/2 plus an overkill bonus. */
export function coinsForClear(
  bossCount: number,
  finalCount: number,
  tiers: UpgradeTiers
): number {
  const base = bossCount * CONFIG.economy.coinsPerBossFrac;
  const overkill = Math.max(0, finalCount - bossCount) * CONFIG.economy.overkillCoinFrac;
  return Math.max(1, Math.floor((base + overkill) * incomeMultiplier(tiers)));
}
