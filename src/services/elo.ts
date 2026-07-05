export const STARTING_ELO = 1200;
const K_FACTOR = 32;

/** Standard Elo rating update. `result` is from the perspective of `myElo`. */
export function computeNewElo(
  myElo: number,
  opponentElo: number,
  result: 'win' | 'draw' | 'loss',
): number {
  const expected = 1 / (1 + Math.pow(10, (opponentElo - myElo) / 400));
  const score = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
  return Math.round(myElo + K_FACTOR * (score - expected));
}
