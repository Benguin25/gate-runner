import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  UPGRADE_IDS,
  ZERO_UPGRADES,
  upgradeCost,
  type UpgradeId,
  type UpgradeTiers,
} from '../game/economy';

// Persistent meta-progress: current level, coin balance and upgrade tiers.
// Survives app restarts via AsyncStorage; upgrades persist even when levels
// are failed, so every run feels like progress.

interface ProgressStore {
  /** Level the player is currently on (1-based, unbounded — endless loops). */
  level: number;
  coins: number;
  upgrades: UpgradeTiers;
  addCoins: (amount: number) => void;
  /** Buy the next tier of an upgrade. Returns false if unaffordable. */
  buyUpgrade: (id: UpgradeId) => boolean;
  advanceLevel: () => void;
}

export const useProgressStore = create<ProgressStore>()(
  persist(
    (set, get) => ({
      level: 1,
      coins: 0,
      upgrades: { ...ZERO_UPGRADES },
      addCoins: (amount) => set((s) => ({ coins: s.coins + amount })),
      buyUpgrade: (id) => {
        const s = get();
        const cost = upgradeCost(id, s.upgrades[id]);
        if (s.coins < cost) {
          return false;
        }
        set({
          coins: s.coins - cost,
          upgrades: { ...s.upgrades, [id]: s.upgrades[id] + 1 },
        });
        return true;
      },
      advanceLevel: () => set((s) => ({ level: s.level + 1 })),
    }),
    {
      name: 'gate-runner-progress',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ level: s.level, coins: s.coins, upgrades: s.upgrades }),
      merge: (persisted, current) => {
        // Defensive merge: keep defaults for anything missing or malformed.
        const p = (persisted ?? {}) as Partial<ProgressStore>;
        const upgrades = { ...ZERO_UPGRADES };
        for (const id of UPGRADE_IDS) {
          const v = p.upgrades?.[id];
          if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
            upgrades[id] = Math.floor(v);
          }
        }
        return {
          ...current,
          level: typeof p.level === 'number' && p.level >= 1 ? Math.floor(p.level) : 1,
          coins: typeof p.coins === 'number' && p.coins >= 0 ? Math.floor(p.coins) : 0,
          upgrades,
        };
      },
    }
  )
);
