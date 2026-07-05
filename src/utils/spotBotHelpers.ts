import { TTTCell } from '../types/ttt.types';
import { SpotBotRoundState } from '../types/spotbot.types';
import { checkLineWinner, isBoardFull } from './tttHelpers';

export function buildInitialSpotBotRound(): SpotBotRoundState {
  return {
    cells: Array(9).fill(0) as TTTCell[],
    currentPlayer: 1,
    result: 0,
    isOver: false,
    history: [],
  };
}

export function isLegalSpotBotMove(state: Pick<SpotBotRoundState, 'cells' | 'isOver'>, cell: number): boolean {
  if (state.isOver) return false;
  if (cell < 0 || cell > 8) return false;
  return state.cells[cell] === 0;
}

export function getLegalSpotBotMoves(state: Pick<SpotBotRoundState, 'cells' | 'isOver'>): number[] {
  if (state.isOver) return [];
  const moves: number[] = [];
  for (let i = 0; i < 9; i++) if (state.cells[i] === 0) moves.push(i);
  return moves;
}

/** Applies a move immutably. Does not validate legality — call isLegalSpotBotMove first. */
export function applySpotBotMove(state: SpotBotRoundState, cell: number): SpotBotRoundState {
  const cells = [...state.cells] as TTTCell[];
  cells[cell] = state.currentPlayer;

  const winner = checkLineWinner(cells);
  const result = winner !== 0 ? winner : (isBoardFull(cells) ? 3 : 0);

  return {
    cells,
    currentPlayer: state.currentPlayer === 1 ? 2 : 1,
    result,
    isOver: result !== 0,
    history: [...state.history, cell],
  };
}
