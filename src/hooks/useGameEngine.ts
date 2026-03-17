import { useState, useCallback, useEffect, useRef } from 'react';
import { GameState, GameConfig, LineId, Player, BoxOwner } from '../types/game.types';
import {
  buildInitialState,
  getCompletedBoxes,
  getAllAvailableLines,
  countSidesOfBox,
  simApplyLine,
  takeSnapshot,
} from '../utils/gameHelpers';
import { getAIMove } from '../ai/aiPlayer';

export interface EngineEvents {
  onBoxClaimed?: (count: number, player: Player, boxKeys: string[], line: LineId) => void;
  onTurnSwitch?: (nextPlayer: Player) => void;
  onGameOver?: () => void;
  onAutoSkip?: (playerName: string) => void;
}

export function useGameEngine(config: GameConfig, events: EngineEvents = {}) {
  const [state, setState] = useState<GameState>(() =>
    buildInitialState(config.gridSize),
  );
  const [isAIThinking, setIsAIThinking]   = useState(false);
  const [timerRemaining, setTimerRemaining] = useState(0);
  const [lastLine, setLastLine]             = useState<LineId | null>(null);
  const [moveCount, setMoveCount]           = useState(0);

  const stateRef         = useRef(state);
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRemRef      = useRef(0);
  const eventsRef        = useRef(events);
  const configRef        = useRef(config);
  stateRef.current  = state;
  eventsRef.current = events;
  configRef.current = config;

  const totalBoxes = (config.gridSize - 1) ** 2;

  // ── Stop timer ─────────────────────────────────────────────────────────────
  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    timerRemRef.current = 0;
    setTimerRemaining(0);
  }, []);

  // ── Apply a move (human or AI) ─────────────────────────────────────────────
  const drawLine = useCallback((line: LineId) => {
    stopTimer();

    // Flash the line immediately for both player and AI moves
    setLastLine(line);
    setTimeout(() => setLastLine(null), 260);

    setState(prev => {
      if (prev.isGameOver) return prev;
      const drawn = line.type === 'h'
        ? prev.hLines[line.row][line.col]
        : prev.vLines[line.row][line.col];
      if (drawn) return prev;

      const snapshot  = takeSnapshot(prev);
      const hLines    = prev.hLines.map(r => [...r]);
      const vLines    = prev.vLines.map(r => [...r]);
      const hLineOwners = prev.hLineOwners.map(r => [...r]) as BoxOwner[][];
      const vLineOwners = prev.vLineOwners.map(r => [...r]) as BoxOwner[][];
      if (line.type === 'h') {
        hLines[line.row][line.col]      = true;
        hLineOwners[line.row][line.col] = prev.currentPlayer;
      } else {
        vLines[line.row][line.col]      = true;
        vLineOwners[line.row][line.col] = prev.currentPlayer;
      }

      const tempState = { ...prev, hLines, vLines };
      const completed = getCompletedBoxes(tempState, line, config.gridSize);
      const boxes     = prev.boxes.map(r => [...r]) as BoxOwner[][];
      completed.forEach(([r, c]) => { boxes[r][c] = prev.currentPlayer; });

      const scores = { ...prev.scores };
      if (prev.currentPlayer === 1) scores.p1 += completed.length;
      else                          scores.p2 += completed.length;

      const claimed    = scores.p1 + scores.p2;
      const isGameOver = claimed === totalBoxes;
      const nextPlayer: Player = completed.length > 0
        ? prev.currentPlayer
        : (prev.currentPlayer === 1 ? 2 : 1);

      // Fire callbacks (via setTimeout so they run outside setState)
      if (completed.length > 0) {
        const p            = prev.currentPlayer;
        const count        = completed.length;
        const completedKeys = completed.map(([r, c]) => `${r}-${c}`);
        const capturedLine  = line;
        setTimeout(() => eventsRef.current.onBoxClaimed?.(count, p, completedKeys, capturedLine), 0);
      }
      if (!isGameOver && completed.length === 0) {
        const np = nextPlayer;
        setTimeout(() => eventsRef.current.onTurnSwitch?.(np), 0);
      }
      if (isGameOver) {
        setTimeout(() => eventsRef.current.onGameOver?.(), 50);
      }

      return {
        hLines, vLines, hLineOwners, vLineOwners, boxes,
        currentPlayer: nextPlayer,
        scores,
        isGameOver,
        history: [...prev.history, snapshot],
      };
    });
    setMoveCount(c => c + 1);
  }, [config.gridSize, totalBoxes, stopTimer]);

  // ── Undo last move ──────────────────────────────────────────────────────────
  const undoMove = useCallback(() => {
    stopTimer();
    setState(prev => {
      if (!prev.history.length) return prev;
      if (configRef.current.mode === 'ai') {
        let history = [...prev.history];
        let snap = history.pop()!;
        while (history.length > 0 && snap.currentPlayer !== 1) {
          snap = history.pop()!;
        }
        return { ...prev, ...snap, isGameOver: false, history };
      }
      const history = prev.history.slice(0, -1);
      const snap    = prev.history[prev.history.length - 1];
      return { ...prev, ...snap, isGameOver: false, history };
    });
    setIsAIThinking(false);
    setMoveCount(c => c + 1);
  }, [stopTimer]);

  // ── Reset game ──────────────────────────────────────────────────────────────
  const resetGame = useCallback(() => {
    stopTimer();
    setIsAIThinking(false);
    setLastLine(null);
    setState(buildInitialState(config.gridSize));
    setMoveCount(0);
  }, [config.gridSize, stopTimer]);

  // ── AI effect: triggers when it becomes P2's turn ───────────────────────────
  useEffect(() => {
    if (configRef.current.mode !== 'ai') return;
    if (state.isGameOver) return;
    if (state.currentPlayer !== 2) return;

    setIsAIThinking(true);
    const t = setTimeout(() => {
      const s = stateRef.current;
      if (s.isGameOver || s.currentPlayer !== 2) { setIsAIThinking(false); return; }
      const move = getAIMove(s, configRef.current.gridSize, configRef.current.difficulty);
      setIsAIThinking(false);
      drawLine(move);
    }, 520);

    return () => { clearTimeout(t); };
  }, [moveCount, state.isGameOver]); // eslint-disable-line

  // ── Timer effect: starts after each move when it's a human's turn ───────────
  useEffect(() => {
    const cfg = configRef.current;
    if (!cfg.timerSeconds) return;
    if (state.isGameOver) return;
    if (isAIThinking) return;
    if (cfg.mode === 'ai' && state.currentPlayer === 2) return;

    timerRemRef.current = cfg.timerSeconds;
    setTimerRemaining(cfg.timerSeconds);

    const interval = setInterval(() => {
      timerRemRef.current -= 1;
      setTimerRemaining(timerRemRef.current);
      if (timerRemRef.current <= 0) {
        clearInterval(interval);
        timerRef.current = null;
        _autoSkip();
      }
    }, 1000);
    timerRef.current = interval;

    return () => { clearInterval(interval); timerRef.current = null; };
  }, [moveCount, isAIThinking, state.isGameOver]); // eslint-disable-line

  function _autoSkip() {
    const s = stateRef.current;
    if (!s || s.isGameOver) return;
    const avail = getAllAvailableLines(s, configRef.current.gridSize);
    if (!avail.length) return;

    const cells = configRef.current.gridSize - 1;
    const safe  = avail.filter(l => {
      const sim = simApplyLine(s, l);
      for (let r = 0; r < cells; r++) for (let c = 0; c < cells; c++) {
        if (sim.boxes[r][c]) continue;
        if (countSidesOfBox(sim, r, c) === 3) return false;
      }
      return true;
    });
    const move = safe.length
      ? safe[Math.floor(Math.random() * safe.length)]
      : avail[Math.floor(Math.random() * avail.length)];

    const name = s.currentPlayer === 1
      ? configRef.current.p1Name
      : configRef.current.p2Name;

    eventsRef.current.onAutoSkip?.(name);
    setTimeout(() => drawLine(move), 150);
  }

  return { state, isAIThinking, timerRemaining, lastLine, drawLine, undoMove, resetGame };
}
