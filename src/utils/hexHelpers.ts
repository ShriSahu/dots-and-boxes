import { HexCell, HexMove, HexPlayer, HexState } from '../types/hex.types';

export function buildInitialHexState(size: number): HexState {
  return {
    board: Array.from({ length: size }, () => Array(size).fill(0) as HexCell[]),
    size,
    currentPlayer: 1,
    winner: 0,
    isGameOver: false,
    history: [],
  };
}

/**
 * Neighbor offsets for a rhombus hex board where each row is shifted right
 * relative to the one above it. Player 1 connects row 0 to row (size-1);
 * player 2 connects column 0 to column (size-1).
 */
const NEIGHBOR_OFFSETS: [number, number][] = [
  [0, -1], [0, 1],
  [-1, 0], [-1, 1],
  [1, -1], [1, 0],
];

export function getHexNeighbors(row: number, col: number, size: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [dr, dc] of NEIGHBOR_OFFSETS) {
    const r = row + dr, c = col + dc;
    if (r >= 0 && r < size && c >= 0 && c < size) out.push([r, c]);
  }
  return out;
}

export function isLegalHexMove(state: Pick<HexState, 'board' | 'isGameOver'>, move: HexMove, size: number): boolean {
  if (state.isGameOver) return false;
  if (move.row < 0 || move.row >= size || move.col < 0 || move.col >= size) return false;
  return state.board[move.row][move.col] === 0;
}

export function getLegalHexMoves(state: Pick<HexState, 'board' | 'isGameOver'>, size: number): HexMove[] {
  if (state.isGameOver) return [];
  const moves: HexMove[] = [];
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (state.board[r][c] === 0) moves.push({ row: r, col: c });
  }
  return moves;
}

/**
 * BFS connectivity check: does `player`'s stones form an unbroken chain
 * connecting their two edges? Player 1 = top(row 0) to bottom(row size-1).
 * Player 2 = left(col 0) to right(col size-1).
 */
export function checkHexWinner(board: HexCell[][], size: number, player: HexPlayer): boolean {
  const visited = Array.from({ length: size }, () => Array(size).fill(false));
  const queue: [number, number][] = [];

  if (player === 1) {
    for (let c = 0; c < size; c++) {
      if (board[0][c] === 1) { queue.push([0, c]); visited[0][c] = true; }
    }
  } else {
    for (let r = 0; r < size; r++) {
      if (board[r][0] === 2) { queue.push([r, 0]); visited[r][0] = true; }
    }
  }

  while (queue.length) {
    const [r, c] = queue.shift()!;
    if (player === 1 && r === size - 1) return true;
    if (player === 2 && c === size - 1) return true;
    for (const [nr, nc] of getHexNeighbors(r, c, size)) {
      if (!visited[nr][nc] && board[nr][nc] === player) {
        visited[nr][nc] = true;
        queue.push([nr, nc]);
      }
    }
  }
  return false;
}

/** Applies a move immutably. Does not validate legality — call isLegalHexMove first. */
export function applyHexMove(state: HexState, move: HexMove): HexState {
  const board = state.board.map(r => [...r]) as HexCell[][];
  board[move.row][move.col] = state.currentPlayer;

  const won = checkHexWinner(board, state.size, state.currentPlayer);
  const winner: 0 | HexPlayer = won ? state.currentPlayer : 0;

  return {
    board,
    size: state.size,
    currentPlayer: state.currentPlayer === 1 ? 2 : 1,
    winner,
    isGameOver: won,
    history: [...state.history, move],
  };
}
