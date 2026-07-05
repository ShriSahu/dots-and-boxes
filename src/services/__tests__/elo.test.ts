import { computeNewElo, STARTING_ELO } from '../elo';

describe('computeNewElo', () => {
  it('increases rating on a win against an equal opponent', () => {
    const next = computeNewElo(STARTING_ELO, STARTING_ELO, 'win');
    expect(next).toBe(STARTING_ELO + 16);
  });

  it('decreases rating on a loss against an equal opponent', () => {
    const next = computeNewElo(STARTING_ELO, STARTING_ELO, 'loss');
    expect(next).toBe(STARTING_ELO - 16);
  });

  it('leaves rating unchanged on a draw against an equal opponent', () => {
    const next = computeNewElo(STARTING_ELO, STARTING_ELO, 'draw');
    expect(next).toBe(STARTING_ELO);
  });

  it('awards fewer points for beating a much weaker opponent', () => {
    const gainVsWeaker  = computeNewElo(STARTING_ELO, STARTING_ELO - 400, 'win') - STARTING_ELO;
    const gainVsEqual   = computeNewElo(STARTING_ELO, STARTING_ELO, 'win') - STARTING_ELO;
    expect(gainVsWeaker).toBeLessThan(gainVsEqual);
    expect(gainVsWeaker).toBeGreaterThanOrEqual(0);
  });

  it('awards more points for beating a much stronger opponent', () => {
    const gainVsStronger = computeNewElo(STARTING_ELO, STARTING_ELO + 400, 'win') - STARTING_ELO;
    const gainVsEqual     = computeNewElo(STARTING_ELO, STARTING_ELO, 'win') - STARTING_ELO;
    expect(gainVsStronger).toBeGreaterThan(gainVsEqual);
  });

  it('penalizes losing to a much weaker opponent more than losing to an equal', () => {
    const lossVsWeaker = computeNewElo(STARTING_ELO, STARTING_ELO - 400, 'loss') - STARTING_ELO;
    const lossVsEqual   = computeNewElo(STARTING_ELO, STARTING_ELO, 'loss') - STARTING_ELO;
    expect(lossVsWeaker).toBeLessThan(lossVsEqual);
  });
});
