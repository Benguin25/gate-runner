import { create } from 'zustand';

// UI-facing run state: which overlay to show, coins earned by the last clear,
// and a token that resets the sim. Meta-progress lives in progressStore.

export type GamePhase = 'playing' | 'won' | 'lost';

interface GameStore {
  phase: GamePhase;
  /** Coins awarded for the current 'won' overlay. */
  coinsEarned: number;
  /** Bumped on retry/next; the game screen rebuilds the sim when it changes. */
  runId: number;
  win: (coinsEarned: number) => void;
  lose: () => void;
  /** Back to 'playing' with a fresh sim (used by retry and next-level). */
  newRun: () => void;
}

export const useGameStore = create<GameStore>()((set) => ({
  phase: 'playing',
  coinsEarned: 0,
  runId: 0,
  win: (coinsEarned) => set({ phase: 'won', coinsEarned }),
  lose: () => set({ phase: 'lost' }),
  newRun: () => set((s) => ({ phase: 'playing', coinsEarned: 0, runId: s.runId + 1 })),
}));
