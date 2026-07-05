import { useCallback, useEffect, useRef, useState } from 'react';
import { SpotBotRoundState } from '../types/spotbot.types';
import { applySpotBotMove, buildInitialSpotBotRound, isLegalSpotBotMove } from '../utils/spotBotHelpers';
import { getSpotBotAIMove } from '../ai/spotBotAI';

export interface SpotBotLocalRoundEvents {
  onGameOver?: () => void;
}

/** Drives a round against a local bot opponent (player 2). */
export function useSpotBotLocalRound(events: SpotBotLocalRoundEvents = {}) {
  const [state, setState] = useState<SpotBotRoundState>(() => buildInitialSpotBotRound());
  const [isOpponentThinking, setIsOpponentThinking] = useState(false);
  const stateRef  = useRef(state);
  const eventsRef = useRef(events);
  stateRef.current  = state;
  eventsRef.current = events;

  const playMove = useCallback((cell: number) => {
    setState(prev => {
      if (!isLegalSpotBotMove(prev, cell)) return prev;
      const next = applySpotBotMove(prev, cell);
      if (next.isOver) setTimeout(() => eventsRef.current.onGameOver?.(), 50);
      return next;
    });
  }, []);

  useEffect(() => {
    if (state.isOver) return;
    if (state.currentPlayer !== 2) return;

    setIsOpponentThinking(true);
    const t = setTimeout(() => {
      const s = stateRef.current;
      if (s.isOver || s.currentPlayer !== 2) { setIsOpponentThinking(false); return; }
      const move = getSpotBotAIMove(s.cells, 2);
      setIsOpponentThinking(false);
      if (move >= 0) playMove(move);
    }, 500);

    return () => clearTimeout(t);
  }, [state.currentPlayer, state.isOver, state.history.length, playMove]);

  return { state, isOpponentThinking, playMove };
}
