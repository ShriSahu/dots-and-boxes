import { useCallback, useEffect, useRef, useState } from 'react';
import { HexConfig, HexMove, HexState } from '../types/hex.types';
import { applyHexMove, buildInitialHexState, isLegalHexMove } from '../utils/hexHelpers';
import { getHexAIMove } from '../ai/hexAI';

export interface HexEngineEvents {
  onMove?: (move: HexMove, player: 1 | 2) => void;
  onTurnSwitch?: (nextPlayer: 1 | 2) => void;
  onGameOver?: () => void;
}

export function useHexEngine(config: HexConfig, events: HexEngineEvents = {}) {
  const [state, setState] = useState<HexState>(() => buildInitialHexState(config.boardSize));
  const [isAIThinking, setIsAIThinking] = useState(false);

  const stateRef  = useRef(state);
  const eventsRef = useRef(events);
  const configRef = useRef(config);
  stateRef.current  = state;
  eventsRef.current = events;
  configRef.current = config;

  const playMove = useCallback((move: HexMove) => {
    setState(prev => {
      if (!isLegalHexMove(prev, move, prev.size)) return prev;
      const player = prev.currentPlayer;
      const next = applyHexMove(prev, move);

      setTimeout(() => eventsRef.current.onMove?.(move, player), 0);
      if (!next.isGameOver) {
        setTimeout(() => eventsRef.current.onTurnSwitch?.(next.currentPlayer), 0);
      } else {
        setTimeout(() => eventsRef.current.onGameOver?.(), 50);
      }
      return next;
    });
  }, []);

  const resetGame = useCallback(() => {
    setIsAIThinking(false);
    setState(buildInitialHexState(configRef.current.boardSize));
  }, []);

  useEffect(() => {
    if (configRef.current.mode !== 'ai') return;
    if (state.isGameOver) return;
    if (state.currentPlayer !== 2) return;

    setIsAIThinking(true);
    const t = setTimeout(() => {
      const s = stateRef.current;
      if (s.isGameOver || s.currentPlayer !== 2) { setIsAIThinking(false); return; }
      const move = getHexAIMove(s.board, s.size, 2);
      setIsAIThinking(false);
      playMove(move);
    }, 450);

    return () => clearTimeout(t);
  }, [state.currentPlayer, state.isGameOver, state.history.length, playMove]);

  return { state, isAIThinking, playMove, resetGame };
}
