import {
  buildInitialTTTState, checkLineWinner, computeBoardResult, isBoardFull,
  isBoardDecided, isLegalMove, getLegalMoves, applyTTTMove,
} from '../tttHelpers';
import { TTTCell, TTTState } from '../../types/ttt.types';

describe('checkLineWinner', () => {
  it('detects a row win', () => {
    const cells: TTTCell[] = [1, 1, 1, 0, 0, 0, 0, 0, 0];
    expect(checkLineWinner(cells)).toBe(1);
  });

  it('detects a column win', () => {
    const cells: TTTCell[] = [2, 0, 0, 2, 0, 0, 2, 0, 0];
    expect(checkLineWinner(cells)).toBe(2);
  });

  it('detects a diagonal win', () => {
    const cells: TTTCell[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    expect(checkLineWinner(cells)).toBe(1);
  });

  it('returns 0 when no winner', () => {
    const cells: TTTCell[] = [1, 2, 1, 2, 1, 2, 2, 1, 2];
    expect(checkLineWinner(cells)).toBe(0);
  });
});

describe('computeBoardResult / isBoardFull', () => {
  it('is undecided on an empty board', () => {
    expect(computeBoardResult(Array(9).fill(0) as TTTCell[])).toBe(0);
  });

  it('is a draw when full with no winner', () => {
    const cells: TTTCell[] = [1, 2, 1, 2, 1, 2, 2, 1, 2];
    expect(isBoardFull(cells)).toBe(true);
    expect(computeBoardResult(cells)).toBe(3);
  });

  it('reports the winner even if the board is not full', () => {
    const cells: TTTCell[] = [1, 1, 1, 0, 0, 0, 0, 0, 0];
    expect(isBoardFull(cells)).toBe(false);
    expect(computeBoardResult(cells)).toBe(1);
  });
});

describe('isBoardDecided', () => {
  it('treats 0 as not decided, 1/2/3 as decided', () => {
    expect(isBoardDecided(0)).toBe(false);
    expect(isBoardDecided(1)).toBe(true);
    expect(isBoardDecided(2)).toBe(true);
    expect(isBoardDecided(3)).toBe(true);
  });
});

describe('move legality', () => {
  it('allows any board on the opening move (activeBoard null)', () => {
    const state = buildInitialTTTState();
    expect(isLegalMove(state, { board: 4, cell: 4 })).toBe(true);
    expect(getLegalMoves(state)).toHaveLength(81);
  });

  it('restricts play to the active board once set', () => {
    let state = buildInitialTTTState();
    state = applyTTTMove(state, { board: 4, cell: 0 }); // sends opponent to board 0
    expect(state.activeBoard).toBe(0);
    expect(isLegalMove(state, { board: 4, cell: 1 })).toBe(false);
    expect(isLegalMove(state, { board: 0, cell: 1 })).toBe(true);
    expect(getLegalMoves(state).every(m => m.board === 0)).toBe(true);
  });

  it('sends the opponent to the board matching the played cell index', () => {
    const state = buildInitialTTTState();
    // Player 1 plays board4/cell2 -> opponent must play board 2 (still open)
    const next = applyTTTMove(state, { board: 4, cell: 2 });
    expect(next.activeBoard).toBe(2);
  });

  it('opens free choice when the target board is already decided', () => {
    const state: TTTState = { ...buildInitialTTTState(), currentPlayer: 1 };
    // Board 2 already won by player 2 (decided) before player 1's move below.
    state.boards[2]       = [2, 2, 2, 0, 0, 0, 0, 0, 0];
    state.boardResults[2] = 2;
    state.boards[7]       = [1, 1, 0, 0, 0, 0, 0, 0, 0];
    state.activeBoard     = 7;
    // Player 1 plays board7/cell2 -> would send opponent to board 2, but it's decided.
    const next = applyTTTMove(state, { board: 7, cell: 2 });
    expect(next.boardResults[7]).toBe(1);
    expect(next.activeBoard).toBeNull();
  });
});

describe('applyTTTMove — meta win', () => {
  it('detects an overall win across three small-board wins in a row', () => {
    let state = buildInitialTTTState();
    state.boardResults = [1, 1, 0, 0, 0, 0, 0, 0, 0] as any;
    // Force win on board 2 for player 1 via a real move
    state.boards[2] = [1, 1, 0, 0, 0, 0, 0, 0, 0];
    state.activeBoard = 2;
    state.currentPlayer = 1;
    const next = applyTTTMove(state, { board: 2, cell: 2 });
    expect(next.boardResults[2]).toBe(1);
    expect(next.winner).toBe(1);
    expect(next.isGameOver).toBe(true);
  });

  it('is a draw when all boards are decided with no meta line', () => {
    let state = buildInitialTTTState();
    // 0,1 P1; 2 P2; 3,4 P2; 5 P1; 6 draw; 7 draw; 8 undecided -> finish 8 as draw, no 3-in-row
    state.boardResults = [1, 1, 2, 2, 2, 1, 3, 3, 0] as any;
    state.boards[8] = [1, 2, 1, 2, 1, 2, 2, 1, 0];
    state.activeBoard = 8;
    state.currentPlayer = 2;
    const next = applyTTTMove(state, { board: 8, cell: 8 });
    expect(next.boardResults[8]).toBe(3);
    expect(next.winner).toBe(3);
    expect(next.isGameOver).toBe(true);
  });
});
