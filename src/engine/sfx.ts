import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { CONFIG } from '../game/config';

// Sound effects: CC0 .wav files committed under src/assets/audio. One player
// per sound, created once at boot (initSfx from the root layout) and kept for
// the app's lifetime; retriggering seeks back to the start. Every call is
// fire-and-forget — audio must never throw into the game loop.

const SOURCES = {
  pop: require('../assets/audio/pop.wav'),
  quack1: require('../assets/audio/quack1.wav'),
  quack2: require('../assets/audio/quack2.wav'),
  quack3: require('../assets/audio/quack3.wav'),
  womp: require('../assets/audio/womp.wav'),
  peep: require('../assets/audio/peep.wav'),
  ratchet: require('../assets/audio/ratchet.wav'),
  ding: require('../assets/audio/ding.wav'),
  buzz: require('../assets/audio/buzz.wav'),
  thud: require('../assets/audio/thud.wav'),
  chorus: require('../assets/audio/chorus.wav'),
  snap: require('../assets/audio/snap.wav'),
  descend: require('../assets/audio/descend.wav'),
  coins: require('../assets/audio/coins.wav'),
  click: require('../assets/audio/click.wav'),
} as const;

export type SfxName = keyof typeof SOURCES;

const QUACKS: SfxName[] = ['quack1', 'quack2', 'quack3'];

let players: Record<SfxName, AudioPlayer> | null = null;

/** Idempotent; call once at boot so every sound is loaded before play. */
export function initSfx(): void {
  if (players) {
    return;
  }
  setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  const loaded = {} as Record<SfxName, AudioPlayer>;
  for (const name of Object.keys(SOURCES) as SfxName[]) {
    try {
      const player = createAudioPlayer(SOURCES[name]);
      // Rate changes must shift pitch (varispeed), not time-stretch.
      player.shouldCorrectPitch = false;
      loaded[name] = player;
    } catch {
      // A failed load just mutes that sound.
    }
  }
  players = loaded;
}

function trigger(name: SfxName, rate: number): void {
  const player = players?.[name];
  if (!player) {
    return;
  }
  try {
    player.setPlaybackRate(rate);
    player.seekTo(0).catch(() => {});
    player.play();
  } catch {
    // Never let audio break the game loop.
  }
}

export function playSfx(name: SfxName): void {
  trigger(name, 1);
}

/** A random quack, pitch-shifted by up to ±quackPitchJitter per play. */
export function playQuack(): void {
  const jitter = CONFIG.audio.quackPitchJitter;
  trigger(
    QUACKS[Math.floor(Math.random() * QUACKS.length)],
    1 + (Math.random() * 2 - 1) * jitter
  );
}
