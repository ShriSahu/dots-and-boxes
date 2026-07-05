import { getHexAIMove } from '../hexAI';
import { buildInitialHexState, isLegalHexMove, applyHexMove } from '../../utils/hexHelpers';
import { HexCell } from '../../types/hex.types';

describe('getHexAIMove', () => {
  it('always returns a legal move from an empty board', () => {
    const state = buildInitialHexState(7);
    const move = getHexAIMove(state.board, 7, 2);
    expect(isLegalHexMove(state, move, 7)).toBe(true);
  });

  it('takes an immediate winning move when one is available', () => {
    const size = 5;
    const board: HexCell[][] = Array.from({ length: size }, () => Array(size).fill(0) as HexCell[]);
    for (let r = 0; r < size - 1; r++) board[r][2] = 1; // one move from connecting top-bottom
    const move = getHexAIMove(board, size, 1);
    // (4,2) and (4,1) are both adjacent to the (3,2) stone and touch the
    // bottom edge, so either legitimately completes the connection.
    const trial = board.map(r => [...r]) as HexCell[][];
    trial[move.row][move.col] = 1;
    expect(move.row).toBe(4);
    expect([1, 2]).toContain(move.col);
  });

  it('never returns an occupied cell', () => {
    const size = 6;
    const state = buildInitialHexState(size);
    state.board[3][3] = 1;
    state.board[2][2] = 2;
    const move = getHexAIMove(state.board, size, 2);
    expect(state.board[move.row][move.col]).toBe(0);
  });
});
