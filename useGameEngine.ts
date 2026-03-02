import { useState, useCallback, useEffect } from 'react';
import { GameState, GameConfig, LineId, Player, BoxOwner } from '../types/game.types';
import { createInitialState, getCompletedBoxes, isLineDrawn } from '../utils/gameHelpers';
import { getAIMove } from '../ai/aiPlayer';

function buildInitialState(gridSize: number): GameState {
  const base = createInitialState(gridSize as any);
  return {
    ...base,
    currentPlayer: 1,
    scores: { p1: 0, p2: 0 },
    isGameOver: false,
    lastClaimedBoxes: 0,
  };
}

export function useGameEngine(config: GameConfig) {
  const [state, setState] = useState<GameState>(() => buildInitialState(config.gridSize));
  const [isAIThinking, setIsAIThinking] = useState(false);

  const totalBoxes = (config.gridSize - 1) ** 2;

  const drawLine = useCallback((line: LineId) => {
    setState(prev => {
      if (prev.isGameOver) return prev;
      if (isLineDrawn(prev, line)) return prev;

      // Apply line
      const hLines = prev.hLines.map(r => [...r]);
      const vLines = prev.vLines.map(r => [...r]);
      if (line.type === 'h') hLines[line.row][line.col] = true;
      else vLines[line.row][line.col] = true;

      const tempState = { ...prev, hLines, vLines };

      // Check completed boxes
      const completed = getCompletedBoxes(tempState, line, config.gridSize);
      const boxes = prev.boxes.map(r => [...r]) as BoxOwner[][];
      completed.forEach(([r, c]) => { boxes[r][c] = prev.currentPlayer; });

      const scores = { ...prev.scores };
      if (prev.currentPlayer === 1) scores.p1 += completed.length;
      else scores.p2 += completed.length;

      const newTotal = scores.p1 + scores.p2;
      const isGameOver = newTotal === totalBoxes;

      // If player claimed boxes, they go again; otherwise switch
      const nextPlayer: Player = completed.length > 0 ? prev.currentPlayer : (prev.currentPlayer === 1 ? 2 : 1);

      return { hLines, vLines, boxes, currentPlayer: nextPlayer, scores, isGameOver, lastClaimedBoxes: completed.length };
    });
  }, [config.gridSize, totalBoxes]);

  // AI turn trigger
  useEffect(() => {
    if (config.mode !== 'ai') return;
    if (state.isGameOver) return;
    if (state.currentPlayer !== 2) return;

    setIsAIThinking(true);
    const timer = setTimeout(() => {
      const move = getAIMove(state, config.gridSize);
      drawLine(move);
      setIsAIThinking(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [state.currentPlayer, state.isGameOver, config.mode]);

  const resetGame = useCallback(() => {
    setState(buildInitialState(config.gridSize));
    setIsAIThinking(false);
  }, [config.gridSize]);

  return { state, drawLine, resetGame, isAIThinking };
}
