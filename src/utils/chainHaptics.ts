import * as Haptics from 'expo-haptics';

/** Confetti particle counts for each chain-celebration tier (see chainFeedback.ts). */
export const CHAIN_CONFETTI_COUNTS: Record<1 | 2, number> = {
  1: 70,
  2: 160,
};

/** Fires a short staggered sequence of haptic impacts, escalating with chain length. */
export function fireChainHaptics(pulses: number): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  if (pulses <= 1) return;
  setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 110);
  if (pulses >= 3) {
    setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 240);
  }
}
