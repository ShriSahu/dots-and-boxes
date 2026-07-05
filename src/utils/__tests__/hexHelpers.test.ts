import {
  buildInitialHexState, getHexNeighbors, isLegalHexMove, getLegalHexMoves,
  checkHexWinner, applyHexMove,
} from '../hexHelpers';
import { HexCell, HexState } from '../../types/hex.types';

describe('getHexNeighbors', () => {
  it('returns 6 neighbors for an interior cell', () => {
    const neighbors = getHexNeighbors(2, 2, 5);
    expect(neighbors).toHaveLength(6);
  });

  it('clips out-of-bounds neighbors for a corner cell', () => {
    const neighbors = getHexNeighbors(0, 0, 5);
    // (0,-1), (-1,0), (-1,1) are out of bounds -> only 3 remain: (0,1),(1,-1)x,(1,0)
    expect(neighbors.every(([r, c]) => r >= 0 && r < 5 && c >= 0 && c < 5)).toBe(true);
    expect(neighbors.length).toBeLessThan(6);
  });
});

describe('move legality', () => {
  it('allows any empty cell', () => {
    const state = buildInitialHexState(5);
    expect(isLegalHexMove(state, { row: 2, col: 2 }, 5)).toBe(true);
    expect(getLegalHexMoves(state, 5)).toHaveLength(25);
  });

  it('rejects occupied cells and out-of-bounds', () => {
    const state = buildInitialHexState(5);
    state.board[1][1] = 1;
    expect(isLegalHexMove(state, { row: 1, col: 1 }, 5)).toBe(false);
    expect(isLegalHexMove(state, { row: -1, col: 0 }, 5)).toBe(false);
    expect(isLegalHexMove(state, { row: 5, col: 0 }, 5)).toBe(false);
  });

  it('rejects any move once the game is over', () => {
    const state = { ...buildInitialHexState(5), isGameOver: true };
    expect(isLegalHexMove(state, { row: 0, col: 0 }, 5)).toBe(false);
    expect(getLegalHexMoves(state, 5)).toHaveLength(0);
  });
});

describe('checkHexWinner', () => {
  it('detects a top-to-bottom chain for player 1 on a straight column', () => {
    const size = 5;
    const board: HexCell[][] = Array.from({ length: size }, () => Array(size).fill(0) as HexCell[]);
    for (let r = 0; r < size; r++) board[r][2] = 1; // straight vertical line of player 1
    expect(checkHexWinner(board, size, 1)).toBe(true);
    expect(checkHexWinner(board, size, 2)).toBe(false);
  });

  it('detects a left-to-right chain for player 2 using the row-shift adjacency', () => {
    const size = 5;
    const board: HexCell[][] = Array.from({ length: size }, () => Array(size).fill(0) as HexCell[]);
    // A zig-zag chain across row 2, using the (r,c)-(r,c+1) adjacency (always neighbors).
    for (let c = 0; c < size; c++) board[2][c] = 2;
    expect(checkHexWinner(board, size, 2)).toBe(true);
    expect(checkHexWinner(board, size, 1)).toBe(false);
  });

  it('does not connect through a broken chain', () => {
    const size = 5;
    const board: HexCell[][] = Array.from({ length: size }, () => Array(size).fill(0) as HexCell[]);
    board[0][0] = 1; board[1][0] = 1; // gap at row 2
    board[3][0] = 1; board[4][0] = 1;
    expect(checkHexWinner(board, size, 1)).toBe(false);
  });

  it('connects diagonally via the row-offset neighbor rule', () => {
    const size = 5;
    const board: HexCell[][] = Array.from({ length: size }, () => Array(size).fill(0) as HexCell[]);
    // Path from (0,2) down to (4,2) stepping via the (r+1,c-1)/(r+1,c) neighbor rule.
    board[0][2] = 1;
    board[1][2] = 1; // (0,2)-(1,2) is a neighbor pair
    board[2][1] = 1; // (1,2)-(2,1) is a neighbor pair ((r+1,c-1))
    board[3][1] = 1; // (2,1)-(3,1)
    board[4][1] = 1; // (3,1)-(4,1)
    expect(checkHexWinner(board, size, 1)).toBe(true);
  });
});

describe('applyHexMove', () => {
  it('switches the current player and appends history on a non-winning move', () => {
    const state = buildInitialHexState(5);
    const next = applyHexMove(state, { row: 2, col: 2 });
    expect(next.board[2][2]).toBe(1);
    expect(next.currentPlayer).toBe(2);
    expect(next.isGameOver).toBe(false);
    expect(next.history).toHaveLength(1);
  });

  it('declares the mover the winner the instant their chain connects', () => {
    const size = 5;
    const state: HexState = { ...buildInitialHexState(size), currentPlayer: 1 };
    for (let r = 0; r < size - 1; r++) state.board[r][2] = 1; // rows 0..3 filled, row 4 missing
    const next = applyHexMove(state, { row: 4, col: 2 });
    expect(next.isGameOver).toBe(true);
    expect(next.winner).toBe(1);
  });

  it('does not mutate the original state (immutability)', () => {
    const state = buildInitialHexState(5);
    const boardRef = state.board;
    applyHexMove(state, { row: 0, col: 0 });
    expect(state.board).toBe(boardRef);
    expect(state.board[0][0]).toBe(0);
  });
});
