import { getSpotBotAIMove } from '../spotBotAI';
import { TTTCell } from '../../types/ttt.types';

describe('getSpotBotAIMove', () => {
  it('takes an immediate winning move', () => {
    const cells: TTTCell[] = [2, 2, 0, 0, 0, 0, 0, 0, 0];
    expect(getSpotBotAIMove(cells, 2)).toBe(2);
  });

  it('blocks an immediate opponent win', () => {
    const cells: TTTCell[] = [1, 1, 0, 0, 0, 0, 0, 0, 0];
    expect(getSpotBotAIMove(cells, 2)).toBe(2);
  });

  it('takes the center on an empty board', () => {
    const cells: TTTCell[] = Array(9).fill(0);
    expect(getSpotBotAIMove(cells, 2)).toBe(4);
  });

  it('never returns an occupied cell', () => {
    const cells: TTTCell[] = [1, 2, 1, 2, 1, 2, 0, 0, 0];
    const move = getSpotBotAIMove(cells, 2);
    expect(cells[move]).toBe(0);
  });

  it('returns -1 when the board is full', () => {
    const cells: TTTCell[] = [1, 2, 1, 2, 1, 2, 2, 1, 2];
    expect(getSpotBotAIMove(cells, 2)).toBe(-1);
  });
});
