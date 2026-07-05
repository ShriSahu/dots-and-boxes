import { getChainCelebration } from '../chainFeedback';

describe('getChainCelebration', () => {
  it('returns tier 0 with no label for single-box captures', () => {
    expect(getChainCelebration(1)).toEqual({ tier: 0, label: '', hapticPulses: 1 });
  });

  it('returns tier 0 for a 2-box capture', () => {
    expect(getChainCelebration(2).tier).toBe(0);
  });

  it('escalates to tier 1 at a 3-box chain', () => {
    const c = getChainCelebration(3);
    expect(c.tier).toBe(1);
    expect(c.label).not.toBe('');
    expect(c.hapticPulses).toBeGreaterThan(1);
  });

  it('escalates to tier 2 at a 5-box chain', () => {
    const c = getChainCelebration(5);
    expect(c.tier).toBe(2);
    expect(c.hapticPulses).toBeGreaterThan(getChainCelebration(3).hapticPulses);
  });

  it('never decreases in intensity as chain length grows', () => {
    let prevTier = 0;
    for (let n = 1; n <= 8; n++) {
      const c = getChainCelebration(n);
      expect(c.tier).toBeGreaterThanOrEqual(prevTier);
      prevTier = c.tier;
    }
  });
});
