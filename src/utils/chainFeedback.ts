export type ChainTier = 0 | 1 | 2;

export interface ChainCelebration {
  tier: ChainTier;
  /** Prefix shown in the box-claim toast; empty string for ordinary (1-2 box) captures. */
  label: string;
  /** Number of staggered haptic impact pulses to fire. */
  hapticPulses: number;
}

/**
 * Scales the box-claim celebration by chain length. A "chain" here means
 * boxes completed by a single line (a run of 3-sided boxes closed in one
 * move chains into further captures) — count >= 3 is a real chain reaction.
 */
export function getChainCelebration(count: number): ChainCelebration {
  if (count >= 5) return { tier: 2, label: '🔥🔥 MEGA CHAIN! ', hapticPulses: 3 };
  if (count >= 3) return { tier: 1, label: '🔥 Chain! ', hapticPulses: 2 };
  return { tier: 0, label: '', hapticPulses: 1 };
}
