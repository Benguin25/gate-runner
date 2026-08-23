import { create } from 'zustand';

// UI-facing game state: which overlay to show and a token that resets the sim.
// Persistence (level progress, coins, upgrades) arrives with milestone 5.

export type GamePhase = 'playing' | 'won' | 'lost';

interface GameStore {
  phase: GamePhase;
  /** Bumped on retry; the game screen rebuilds the sim when it changes. */
  runId: number;
  setPhase: (phase: GamePhase) => void;
  retry: () => void;
}

export const useGameStore = create<GameStore>()((set) => ({
  phase: 'playing',
  runId: 0,
  setPhase: (phase) => set({ phase }),
  retry: () => set((s) => ({ phase: 'playing', runId: s.runId + 1 })),
}));
