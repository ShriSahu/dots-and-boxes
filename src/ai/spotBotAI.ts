import { TTTCell } from '../types/ttt.types';
import { checkLineWinner } from '../utils/tttHelpers';

const CENTER = 4;
const CORNERS = [0, 2, 6, 8];

/**
 * Simple classic-tic-tac-toe heuristic: take an immediate win, block an
 * immediate loss, else prefer center, then a corner, else any open cell.
 * Deliberately not perfect play — an unbeatable bot would give away that
 * it's a bot instantly, which defeats the point of "Spot the Bot".
 */
export function getSpotBotAIMove(cells: TTTCell[], aiPlayer: 1 | 2): number {
  const empty = cells.map((v, i) => (v === 0 ? i : -1)).filter(i => i >= 0);
  if (!empty.length) return -1;

  const opponent: 1 | 2 = aiPlayer === 1 ? 2 : 1;

  for (const i of empty) {
    const trial = [...cells];
    trial[i] = aiPlayer;
    if (checkLineWinner(trial) === aiPlayer) return i;
  }

  for (const i of empty) {
    const trial = [...cells];
    trial[i] = opponent;
    if (checkLineWinner(trial) === opponent) return i;
  }

  if (empty.includes(CENTER)) return CENTER;

  const openCorners = CORNERS.filter(c => empty.includes(c));
  if (openCorners.length) return openCorners[Math.floor(Math.random() * openCorners.length)];

  return empty[Math.floor(Math.random() * empty.length)];
}
