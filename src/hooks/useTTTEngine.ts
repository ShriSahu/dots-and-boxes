import { useCallback, useEffect, useRef, useState } from 'react';
import { TTTConfig, TTTMove, TTTState } from '../types/ttt.types';
import { applyTTTMove, buildInitialTTTState, isLegalMove } from '../utils/tttHelpers';
import { getTTTAIMove } from '../ai/tttAI';

export interface TTTEngineEvents {
  onMove?: (move: TTTMove, player: 1 | 2, boardWon: boolean) => void;
  onTurnSwitch?: (nextPlayer: 1 | 2) => void;
  onGameOver?: () => void;
}

export function useTTTEngine(config: TTTConfig, events: TTTEngineEvents = {}) {
  const [state, setState] = useState<TTTState>(() => buildInitialTTTState());
  const [isAIThinking, setIsAIThinking] = useState(false);

  const stateRef  = useRef(state);
  const eventsRef = useRef(events);
  const configRef = useRef(config);
  stateRef.current  = state;
  eventsRef.current = events;
  configRef.current = config;

  const playMove = useCallback((move: TTTMove) => {
    setState(prev => {
      if (!isLegalMove(prev, move)) return prev;
      const boardWasDecided = prev.boardResults[move.board];
      const player = prev.currentPlayer;
      const next = applyTTTMove(prev, move);
      const boardWon = boardWasDecided === 0 && next.boardResults[move.board] !== 0;

      setTimeout(() => eventsRef.current.onMove?.(move, player, boardWon), 0);
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
    setState(buildInitialTTTState());
  }, []);

  // ── AI turn effect ───────────────────────────────────────────────────────
  useEffect(() => {
    if (configRef.current.mode !== 'ai') return;
    if (state.isGameOver) return;
    if (state.currentPlayer !== 2) return;

    setIsAIThinking(true);
    const t = setTimeout(() => {
      const s = stateRef.current;
      if (s.isGameOver || s.currentPlayer !== 2) { setIsAIThinking(false); return; }
      const move = getTTTAIMove(s, configRef.current.difficulty);
      setIsAIThinking(false);
      playMove(move);
    }, 500);

    return () => clearTimeout(t);
  }, [state.currentPlayer, state.isGameOver, state.history.length, playMove]);

  return { state, isAIThinking, playMove, resetGame };
}
