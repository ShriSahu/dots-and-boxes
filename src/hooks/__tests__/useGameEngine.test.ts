import { renderHook, act } from '@testing-library/react-native';
import { GameConfig, LineId, Player } from '../../types/game.types';
import { useGameEngine, EngineEvents } from '../useGameEngine';

const baseConfig: GameConfig = {
  gridSize: 3,
  mode: '2player',
  p1Name: 'Alice',
  p2Name: 'Bob',
  difficulty: 'medium',
  timerSeconds: 0,
};

function setup(config: Partial<GameConfig> = {}, events: EngineEvents = {}) {
  return renderHook(() => useGameEngine({ ...baseConfig, ...config }, events));
}

const h = (row: number, col: number): LineId => ({ type: 'h', row, col });
const v = (row: number, col: number): LineId => ({ type: 'v', row, col });

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

describe('useGameEngine', () => {
  it('initialises an empty board with player 1 to move', async () => {
    const { result } = await setup();
    expect(result.current.state.currentPlayer).toBe(1);
    expect(result.current.state.scores).toEqual({ p1: 0, p2: 0 });
    expect(result.current.state.isGameOver).toBe(false);
  });

  it('switches turn after a non-completing move', async () => {
    const { result } = await setup();
    await act(async () => { result.current.drawLine(h(0, 0)); });
    expect(result.current.state.hLines[0][0]).toBe(true);
    expect(result.current.state.currentPlayer).toBe(2);
  });

  it('ignores a move on an already-drawn line', async () => {
    const { result } = await setup();
    await act(async () => { result.current.drawLine(h(0, 0)); });
    await act(async () => { result.current.drawLine(h(0, 0)); });
    // Still player 2 — the duplicate move had no effect.
    expect(result.current.state.currentPlayer).toBe(2);
  });

  it('keeps the turn and scores when a box is completed', async () => {
    const { result } = await setup();
    // Three non-completing sides of box(0,0), alternating turns.
    await act(async () => { result.current.drawLine(h(0, 0)); }); // P1 -> P2
    await act(async () => { result.current.drawLine(v(0, 0)); }); // P2 -> P1
    await act(async () => { result.current.drawLine(v(0, 1)); }); // P1 -> P2
    // P2 closes the box and keeps the turn.
    await act(async () => { result.current.drawLine(h(1, 0)); });
    expect(result.current.state.scores).toEqual({ p1: 0, p2: 1 });
    expect(result.current.state.boxes[0][0]).toBe(2);
    expect(result.current.state.currentPlayer).toBe(2);
  });

  it('undoes the last move in 2-player mode', async () => {
    const { result } = await setup();
    await act(async () => { result.current.drawLine(h(0, 0)); });
    await act(async () => { result.current.undoMove(); });
    expect(result.current.state.hLines[0][0]).toBe(false);
    expect(result.current.state.currentPlayer).toBe(1);
    expect(result.current.state.history).toHaveLength(0);
  });

  it('resets the board', async () => {
    const { result } = await setup();
    await act(async () => { result.current.drawLine(h(0, 0)); });
    await act(async () => { result.current.drawLine(v(0, 0)); });
    await act(async () => { result.current.resetGame(); });
    expect(result.current.state.currentPlayer).toBe(1);
    expect(result.current.state.hLines.flat().every(x => !x)).toBe(true);
    expect(result.current.state.history).toHaveLength(0);
  });

  it('fires onTurnSwitch and onBoxClaimed callbacks', async () => {
    const onTurnSwitch = jest.fn<void, [Player]>();
    const onBoxClaimed = jest.fn();
    const { result } = await setup({}, { onTurnSwitch, onBoxClaimed });

    await act(async () => { result.current.drawLine(h(0, 0)); });
    await act(async () => { jest.runOnlyPendingTimers(); });
    expect(onTurnSwitch).toHaveBeenCalledWith(2);

    await act(async () => { result.current.drawLine(v(0, 0)); });
    await act(async () => { result.current.drawLine(v(0, 1)); });
    await act(async () => { result.current.drawLine(h(1, 0)); });
    await act(async () => { jest.runOnlyPendingTimers(); });
    expect(onBoxClaimed).toHaveBeenCalledWith(1, 2, ['0-0'], h(1, 0));
  });
});
