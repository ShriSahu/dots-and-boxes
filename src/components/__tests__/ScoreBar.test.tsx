import React from 'react';
import { render, screen } from '@testing-library/react-native';
import ScoreBar from '../ScoreBar';
import { buildInitialState } from '../../utils/gameHelpers';
import { GameConfig, GameState } from '../../types/game.types';

const config: GameConfig = {
  gridSize: 3,
  mode: '2player',
  p1Name: 'Alice',
  p2Name: 'Bob',
  difficulty: 'medium',
  timerSeconds: 0,
};

function renderBar(overrides: Partial<{
  state: GameState; isAIThinking: boolean; timerRemaining: number; timerMax: number;
}> = {}) {
  const props = {
    state: buildInitialState(3),
    config,
    isAIThinking: false,
    timerRemaining: 0,
    timerMax: 0,
    ...overrides,
  };
  return render(<ScoreBar {...props} />);
}

describe('ScoreBar', () => {
  it('renders both player names', async () => {
    await renderBar();
    expect(screen.getByText('Alice')).toBeTruthy();
    expect(screen.getByText('Bob')).toBeTruthy();
  });

  it('shows whose turn it is', async () => {
    await renderBar();
    expect(screen.getByText('Alice attacks')).toBeTruthy();
  });

  it('shows remaining boxes for a 3x3 grid', async () => {
    await renderBar();
    expect(screen.getByText('4 boxes left')).toBeTruthy();
  });

  it('reflects current scores', async () => {
    const state = buildInitialState(3);
    state.scores = { p1: 2, p2: 1 };
    await renderBar({ state });
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('1 boxes left')).toBeTruthy();
  });

  it('announces AI planning state', async () => {
    await renderBar({ isAIThinking: true });
    expect(screen.getByText('Bob is planning')).toBeTruthy();
  });

  it('shows board-complete when the game is over', async () => {
    const state = buildInitialState(3);
    state.isGameOver = true;
    await renderBar({ state });
    expect(screen.getByText('Board complete')).toBeTruthy();
  });
});
