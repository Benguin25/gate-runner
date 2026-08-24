import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

// Sound effects. The .wav files are synthesized offline by scripts/gensfx.ts
// and committed under assets/sfx. One player per sound, created once and kept
// for the app's lifetime; retriggering seeks back to the start. Every call is
// fire-and-forget — audio must never throw into the game loop.

const SOURCES = {
  pop: require('../../assets/sfx/pop.wav'),
  deflate: require('../../assets/sfx/deflate.wav'),
  hit: require('../../assets/sfx/hit.wav'),
  boss: require('../../assets/sfx/boss.wav'),
  spin: require('../../assets/sfx/spin.wav'),
  win: require('../../assets/sfx/win.wav'),
  lose: require('../../assets/sfx/lose.wav'),
  coin: require('../../assets/sfx/coin.wav'),
} as const;

export type SfxName = keyof typeof SOURCES;

let players: Record<SfxName, AudioPlayer> | null = null;

/** Idempotent; call once before the first playSfx (e.g. when the game mounts). */
export function initSfx(): void {
  if (players) {
    return;
  }
  setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  const loaded = {} as Record<SfxName, AudioPlayer>;
  for (const name of Object.keys(SOURCES) as SfxName[]) {
    try {
      loaded[name] = createAudioPlayer(SOURCES[name]);
    } catch {
      // A failed load just mutes that sound.
    }
  }
  players = loaded;
}

export function playSfx(name: SfxName): void {
  const player = players?.[name];
  if (!player) {
    return;
  }
  try {
    player.seekTo(0).catch(() => {});
    player.play();
  } catch {
    // Never let audio break the game loop.
  }
}
