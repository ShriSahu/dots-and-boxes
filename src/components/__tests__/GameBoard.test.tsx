import React from 'react';
import { render } from '@testing-library/react-native';
import GameBoard from '../GameBoard';
import { buildInitialState } from '../../utils/gameHelpers';
import { GameConfig } from '../../types/game.types';

const config: GameConfig = {
  gridSize: 3,
  mode: '2player',
  p1Name: 'Alice',
  p2Name: 'Bob',
  difficulty: 'medium',
  timerSeconds: 0,
};

describe('GameBoard', () => {
  it('renders an empty board without crashing', async () => {
    const { toJSON } = await render(
      <GameBoard state={buildInitialState(3)} config={config} onLineTap={jest.fn()} />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders the owner initial of a claimed box', async () => {
    const state = buildInitialState(3);
    state.boxes[0][0] = 1; // claimed by Alice
    const { toJSON } = await render(
      <GameBoard state={state} config={config} onLineTap={jest.fn()} />,
    );
    // The owner's initial ("A") is drawn into the SVG box.
    expect(JSON.stringify(toJSON())).toContain('A');
  });

  it('renders while disabled', async () => {
    const { toJSON } = await render(
      <GameBoard state={buildInitialState(3)} config={config} onLineTap={jest.fn()} disabled />,
    );
    expect(toJSON()).toBeTruthy();
  });
});
