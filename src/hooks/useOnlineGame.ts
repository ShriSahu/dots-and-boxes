import { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, LineId, Player, BoxOwner, OnlineRoom, GridSize } from '../types/game.types';
import {
  subscribeToRoom, applyMove, abandonRoom,
  requestRematch as reqRematch, unflattenBoard, skipTurn,
} from '../services/gameRoom';
import { getCompletedBoxes } from '../utils/gameHelpers';
import { buildInitialState } from '../utils/gameHelpers';

export interface OnlineGameEvents {
  onBoxClaimed?: (count: number, player: Player, boxKeys: string[], line: LineId) => void;
  onTurnSwitch?: () => void;
  onGameOver?: () => void;
  onOpponentDisconnected?: () => void;
  onAutoSkip?: (playerName: string) => void;
}

export function useOnlineGame(
  roomCode: string,
  myUid: string,
  isHost: boolean,
  gridSize: GridSize,
  events: OnlineGameEvents = {},
) {
  const [room, setRoom]       = useState<OnlineRoom | null>(null);
  const [state, setState]     = useState<GameState>(() => buildInitialState(gridSize));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastLine, setLastLine]         = useState<LineId | null>(null);
  const [timerRemaining, setTimerRemaining] = useState(0);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const prevMoveCount  = useRef(-1);
  const prevStatus     = useRef<OnlineRoom['status'] | null>(null);
  const eventsRef      = useRef(events);
  eventsRef.current    = events;

  // Client-side line ownership tracking (Firestore only stores booleans)
  const dots  = gridSize;
  const cells = gridSize - 1;
  const lineOwnersRef = useRef({
    hLineOwners: Array.from({ length: dots  }, () => Array(cells).fill(0) as BoxOwner[]),
    vLineOwners: Array.from({ length: cells }, () => Array(dots).fill(0)  as BoxOwner[]),
  });

  // ── Online turn timer ────────────────────────────────────────────────────
  useEffect(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    // timerSeconds === 0 means the room was created without a turn timer —
    // must not silently fall back to a default, or turns will auto-skip
    // with no visible countdown (the display uses the same 0-means-off rule).
    if (!room?.turnStartedAt || room.status !== 'active' || !room.timerSeconds) {
      setTimerRemaining(0);
      return;
    }

    const timerMax = room.timerSeconds;
    let skipFired = false;  // one-shot guard — prevent double skip on same turn

    const tick = () => {
      const tsAt = room.turnStartedAt;
      const tsMs: number = typeof tsAt === 'number'
        ? tsAt
        : (tsAt as any)?.toMillis?.() ?? Date.now();
      const elapsed = Math.floor((Date.now() - tsMs) / 1000);
      const remaining = Math.max(0, timerMax - elapsed);
      setTimerRemaining(remaining);

      if (remaining === 0 && room.currentPlayerUid === myUid && !skipFired) {
        skipFired = true;
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        // It's my turn and time is up — submit skip
        skipTurn(roomCode, myUid).catch(() => {});
        eventsRef.current.onAutoSkip?.(isHost ? room.host.name : (room.guest.name ?? ''));
      }
    };

    tick(); // run immediately
    timerIntervalRef.current = setInterval(tick, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [room?.moveCount, room?.status]); // reset on every move

  // ── Subscribe to Firestore room ──────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeToRoom(roomCode, (r: OnlineRoom) => {
      setRoom(r);

      // Rebuild GameState from flat arrays
      const { hLines, vLines, boxes } = unflattenBoard(
        { hLines: r.hLines, vLines: r.vLines, boxes: r.boxes },
        r.gridSize,
      );

      // Fire events when move count changes
      if (prevMoveCount.current !== -1 && r.moveCount > prevMoveCount.current) {
        const movedUid  = r.lastMove?.uid;
        const player: Player = movedUid === r.host.uid ? 1 : 2;

        // Track which player owns each line
        if (r.lastMove) {
          const lm = r.lastMove;
          if (lm.type !== 'skip') {
            // Only update line owners for real moves (not skips)
            if (lm.type === 'h') lineOwnersRef.current.hLineOwners[lm.row][lm.col] = player;
            else                  lineOwnersRef.current.vLineOwners[lm.row][lm.col] = player;
            const line: LineId = { type: lm.type as 'h' | 'v', row: lm.row, col: lm.col };
            setLastLine(line);
            setTimeout(() => setLastLine(null), 260);
          }
        }

        // Turn switched if the current player is different from who just moved
        if (r.currentPlayerUid !== movedUid) {
          setTimeout(() => eventsRef.current.onTurnSwitch?.(), 0);
        }
      }
      prevMoveCount.current = r.moveCount;

      setState({
        hLines,
        vLines,
        hLineOwners: lineOwnersRef.current.hLineOwners.map(row => [...row]) as BoxOwner[][],
        vLineOwners: lineOwnersRef.current.vLineOwners.map(row => [...row]) as BoxOwner[][],
        boxes: boxes as BoxOwner[][],
        currentPlayer: r.currentPlayerUid === r.host.uid ? 1 : 2,
        scores: { p1: r.host.score, p2: r.guest.score },
        isGameOver: r.status === 'finished',
        history: [],
      });

      // Status changes
      if (prevStatus.current !== null && prevStatus.current !== r.status) {
        if (r.status === 'finished') {
          setTimeout(() => eventsRef.current.onGameOver?.(), 50);
        }
        if (r.status === 'abandoned') {
          setTimeout(() => eventsRef.current.onOpponentDisconnected?.(), 0);
        }
      }
      prevStatus.current = r.status;
    });
    return unsub;
  }, [roomCode]);

  // ── Draw a line (only when it's my turn) ────────────────────────────────
  const drawLine = useCallback(async (line: LineId) => {
    if (!room) return;
    if (room.currentPlayerUid !== myUid) return;
    if (room.status !== 'active') return;
    if (isSubmitting) return;

    setIsSubmitting(true);
    const roomAtTap = room; // stable snapshot for this move, in case `room` updates mid-flight
    try {
      const { hLines, vLines, boxes } = unflattenBoard(
        { hLines: roomAtTap.hLines, vLines: roomAtTap.vLines, boxes: roomAtTap.boxes },
        roomAtTap.gridSize,
      );

      const newHLines = hLines.map(r => [...r]);
      const newVLines = vLines.map(r => [...r]);
      if (line.type === 'h') newHLines[line.row][line.col] = true;
      else                   newVLines[line.row][line.col] = true;

      const tempState = { hLines: newHLines, vLines: newVLines, boxes };
      const completed = getCompletedBoxes(tempState, line, roomAtTap.gridSize);

      const newBoxes  = boxes.map(r => [...r]) as BoxOwner[][];
      const myPlayer: Player = isHost ? 1 : 2;
      completed.forEach(([r, c]) => { newBoxes[r][c] = myPlayer; });

      const myScore    = (isHost ? roomAtTap.host.score : roomAtTap.guest.score) + completed.length;
      const oppScore   = isHost ? roomAtTap.guest.score : roomAtTap.host.score;
      const totalBoxes = (roomAtTap.gridSize - 1) ** 2;
      const isGameOver = (myScore + oppScore) === totalBoxes;

      const nextUid = completed.length > 0
        ? myUid
        : (isHost ? roomAtTap.guest.uid! : roomAtTap.host.uid);

      const hostScore  = isHost ? myScore  : oppScore;
      const guestScore = isHost ? oppScore : myScore;

      // Optimistic local update — apply the line/box/score change immediately
      // instead of waiting on the Firestore round-trip, so the tap feels instant.
      // The next onSnapshot from Firestore will reconcile with the authoritative
      // state (recomputed the same way, so it should be a no-op visually).
      if (line.type === 'h') lineOwnersRef.current.hLineOwners[line.row][line.col] = myPlayer;
      else                   lineOwnersRef.current.vLineOwners[line.row][line.col] = myPlayer;

      setLastLine(line);
      setTimeout(() => setLastLine(null), 260);

      setState({
        hLines: newHLines,
        vLines: newVLines,
        hLineOwners: lineOwnersRef.current.hLineOwners.map(r => [...r]) as BoxOwner[][],
        vLineOwners: lineOwnersRef.current.vLineOwners.map(r => [...r]) as BoxOwner[][],
        boxes: newBoxes,
        currentPlayer: nextUid === roomAtTap.host.uid ? 1 : 2,
        scores: { p1: hostScore, p2: guestScore },
        isGameOver,
        history: [],
      });

      if (completed.length > 0) {
        const completedKeys = completed.map(([r, c]) => `${r}-${c}`);
        setTimeout(() => eventsRef.current.onBoxClaimed?.(completed.length, myPlayer, completedKeys, line), 0);
      }

      await applyMove(
        roomCode, line, myUid, nextUid,
        newHLines.flat(), newVLines.flat(), newBoxes.flat(),
        hostScore, guestScore, isGameOver,
      );
    } catch (_) {
      // Move was rejected (stale tap / turn conflict) — the optimistic update
      // above is now wrong. Revert to the last known-good server state; if the
      // opponent's move already landed, the next snapshot will fix it anyway.
      const { hLines, vLines, boxes } = unflattenBoard(
        { hLines: roomAtTap.hLines, vLines: roomAtTap.vLines, boxes: roomAtTap.boxes },
        roomAtTap.gridSize,
      );
      setState({
        hLines,
        vLines,
        hLineOwners: lineOwnersRef.current.hLineOwners.map(r => [...r]) as BoxOwner[][],
        vLineOwners: lineOwnersRef.current.vLineOwners.map(r => [...r]) as BoxOwner[][],
        boxes: boxes as BoxOwner[][],
        currentPlayer: roomAtTap.currentPlayerUid === roomAtTap.host.uid ? 1 : 2,
        scores: { p1: roomAtTap.host.score, p2: roomAtTap.guest.score },
        isGameOver: roomAtTap.status === 'finished',
        history: [],
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [room, myUid, isHost, roomCode, isSubmitting]);

  const abandon = useCallback(() => abandonRoom(roomCode), [roomCode]);

  const requestRematch = useCallback(async (): Promise<string | null> => {
    if (!room) return null;
    const myName = isHost ? room.host.name : (room.guest.name ?? '');
    return reqRematch(roomCode, myUid, myName, isHost, room.gridSize);
  }, [room, roomCode, myUid, isHost]);

  // ── Cleanup timer on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  const isMyTurn     = room?.currentPlayerUid === myUid && room?.status === 'active';
  const opponentName = room
    ? (isHost ? (room.guest.name ?? 'Waiting…') : room.host.name)
    : 'Waiting…';
  const myName = room
    ? (isHost ? room.host.name : (room.guest.name ?? ''))
    : '';

  return {
    room,
    state,
    isMyTurn,
    isSubmitting,
    opponentName,
    myName,
    timerRemaining,
    lastLine,
    drawLine,
    abandon,
    requestRematch,
  };
}
