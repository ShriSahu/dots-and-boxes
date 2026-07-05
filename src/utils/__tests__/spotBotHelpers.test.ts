import {
  buildInitialSpotBotRound, isLegalSpotBotMove, getLegalSpotBotMoves, applySpotBotMove,
} from '../spotBotHelpers';
import { SpotBotRoundState } from '../../types/spotbot.types';
import { TTTCell } from '../../types/ttt.types';

describe('move legality', () => {
  it('allows any empty cell on the opening move', () => {
    const state = buildInitialSpotBotRound();
    expect(isLegalSpotBotMove(state, 4)).toBe(true);
    expect(getLegalSpotBotMoves(state)).toHaveLength(9);
  });

  it('rejects an occupied cell', () => {
    const state = buildInitialSpotBotRound();
    state.cells[4] = 1;
    expect(isLegalSpotBotMove(state, 4)).toBe(false);
  });

  it('rejects any move once the round is over', () => {
    const state = { ...buildInitialSpotBotRound(), isOver: true };
    expect(isLegalSpotBotMove(state, 0)).toBe(false);
    expect(getLegalSpotBotMoves(state)).toHaveLength(0);
  });
});

describe('applySpotBotMove', () => {
  it('switches player and appends history without ending the round', () => {
    const state = buildInitialSpotBotRound();
    const next = applySpotBotMove(state, 0);
    expect(next.cells[0]).toBe(1);
    expect(next.currentPlayer).toBe(2);
    expect(next.isOver).toBe(false);
    expect(next.result).toBe(0);
    expect(next.history).toEqual([0]);
  });

  it('declares a winner on three in a row', () => {
    const state: SpotBotRoundState = { ...buildInitialSpotBotRound(), currentPlayer: 1 };
    state.cells = [1, 1, 0, 0, 0, 0, 0, 0, 0] as TTTCell[];
    const next = applySpotBotMove(state, 2);
    expect(next.result).toBe(1);
    expect(next.isOver).toBe(true);
  });

  it('declares a draw on a full board with no winner', () => {
    const state: SpotBotRoundState = { ...buildInitialSpotBotRound(), currentPlayer: 2 };
    state.cells = [1, 2, 1, 2, 1, 2, 2, 1, 0] as TTTCell[];
    const next = applySpotBotMove(state, 8);
    expect(next.result).toBe(3);
    expect(next.isOver).toBe(true);
  });

  it('does not mutate the original state', () => {
    const state = buildInitialSpotBotRound();
    const cellsRef = state.cells;
    applySpotBotMove(state, 0);
    expect(state.cells).toBe(cellsRef);
    expect(state.cells[0]).toBe(0);
  });
});
