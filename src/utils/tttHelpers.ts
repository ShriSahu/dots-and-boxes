import { TTTBoardResult, TTTCell, TTTMove, TTTPlayer, TTTState } from '../types/ttt.types';

const LINES: [number, number, number][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6],            // diagonals
];

export function buildInitialTTTState(): TTTState {
  return {
    boards:        Array.from({ length: 9 }, () => Array(9).fill(0) as TTTCell[]),
    boardResults:  Array(9).fill(0) as TTTBoardResult[],
    activeBoard:   null,
    currentPlayer: 1,
    winner:        0,
    isGameOver:    false,
    history:       [],
  };
}

/** Returns the winning player for a 9-cell board, or 0 if none. Ignores draws. */
export function checkLineWinner(cells: TTTCell[]): TTTPlayer | 0 {
  for (const [a, b, c] of LINES) {
    if (cells[a] !== 0 && cells[a] === cells[b] && cells[b] === cells[c]) {
      return cells[a] as TTTPlayer;
    }
  }
  return 0;
}

export function isBoardFull(cells: TTTCell[]): boolean {
  return cells.every(c => c !== 0);
}

/** Computes a small board's result (0 = undecided, 1/2 = won, 3 = drawn/full). */
export function computeBoardResult(cells: TTTCell[]): TTTBoardResult {
  const winner = checkLineWinner(cells);
  if (winner !== 0) return winner;
  return isBoardFull(cells) ? 3 : 0;
}

/** A small board is "decided" (unplayable) once it has a winner or is full. */
export function isBoardDecided(result: TTTBoardResult): boolean {
  return result !== 0;
}

/** Checks whether a move (board+cell) is currently legal given the state. */
export function isLegalMove(state: Pick<TTTState, 'boards' | 'boardResults' | 'activeBoard' | 'isGameOver'>, move: TTTMove): boolean {
  if (state.isGameOver) return false;
  if (move.board < 0 || move.board > 8 || move.cell < 0 || move.cell > 8) return false;
  if (isBoardDecided(state.boardResults[move.board])) return false;
  if (state.boards[move.board][move.cell] !== 0) return false;
  if (state.activeBoard !== null && state.activeBoard !== move.board) return false;
  return true;
}

export function getLegalMoves(state: Pick<TTTState, 'boards' | 'boardResults' | 'activeBoard' | 'isGameOver'>): TTTMove[] {
  if (state.isGameOver) return [];
  const boardsToCheck = state.activeBoard !== null ? [state.activeBoard] : [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const moves: TTTMove[] = [];
  for (const b of boardsToCheck) {
    if (isBoardDecided(state.boardResults[b])) continue;
    for (let c = 0; c < 9; c++) {
      if (state.boards[b][c] === 0) moves.push({ board: b, cell: c });
    }
  }
  return moves;
}

/**
 * Applies a move immutably, returning the new state. Does not validate
 * legality — callers must check isLegalMove first.
 */
export function applyTTTMove(state: TTTState, move: TTTMove): TTTState {
  const boards = state.boards.map(b => [...b]) as TTTCell[][];
  boards[move.board][move.cell] = state.currentPlayer;

  const boardResults = [...state.boardResults] as TTTBoardResult[];
  boardResults[move.board] = computeBoardResult(boards[move.board]);

  const metaCells = boardResults.map(r => (r === 1 || r === 2 ? r : 0)) as TTTCell[];
  const metaWinner = checkLineWinner(metaCells);
  const allDecided = boardResults.every(isBoardDecided);
  const winner: TTTBoardResult = metaWinner !== 0 ? metaWinner : (allDecided ? 3 : 0);
  const isGameOver = winner !== 0;

  // Next player is sent to the board matching this move's cell index, unless
  // that board is already decided — then they may play anywhere.
  const targetBoard = move.cell;
  const activeBoard = isGameOver
    ? null
    : (isBoardDecided(boardResults[targetBoard]) ? null : targetBoard);

  return {
    boards,
    boardResults,
    activeBoard,
    currentPlayer: state.currentPlayer === 1 ? 2 : 1,
    winner,
    isGameOver,
    history: [...state.history, move],
  };
}
