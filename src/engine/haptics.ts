import * as Haptics from 'expo-haptics';
import type { SimEventKind } from '../game/types';

// Haptic feedback per juice moment. Fire-and-forget: haptics must never
// throw into the game loop, and devices without a vibrator just no-op.

export type HapticKind = SimEventKind;

export function playHaptic(kind: HapticKind): void {
  let p: Promise<void>;
  switch (kind) {
    case 'gateGood':
    case 'gambleWin':
    case 'gambleLose':
      // Spec: medium haptic on every gate pass (the gamble roll included).
      p = Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      break;
    case 'gateBad':
    case 'enemyHit':
      p = Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      break;
    case 'bossHit':
      p = Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      break;
    case 'won':
      p = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      break;
    case 'lost':
      p = Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      break;
    case 'drained':
      // The pull-in is continuous; buzzing 25x/sec would be noise.
      return;
  }
  p.catch(() => {});
}
