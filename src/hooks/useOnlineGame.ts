import { useState, useEffect, useRef, useCallback } from 'react';
import { GameState, LineId, Player, BoxOwner, OnlineRoom, GridSize } from '../types/game.types';
import {
  subscribeToRoom, applyMove, abandonRoom,
  requestRematch as reqRematch, unflattenBoard,
} from '../services/gameRoom';
import { getCompletedBoxes } from '../utils/gameHelpers';
import { buildInitialState } from '../utils/gameHelpers';

export interface OnlineGameEvents {
  onBoxClaimed?: (count: number, player: Player, boxKeys: string[], line: LineId) => void;
  onTurnSwitch?: () => void;
  onGameOver?: () => void;
  onOpponentDisconnected?: () => void;
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
          if (lm.type === 'h') lineOwnersRef.current.hLineOwners[lm.row][lm.col] = player;
          else                  lineOwnersRef.current.vLineOwners[lm.row][lm.col] = player;

          const line: LineId = { type: lm.type, row: lm.row, col: lm.col };
          setLastLine(line);
          setTimeout(() => setLastLine(null), 260);
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
    try {
      const { hLines, vLines, boxes } = unflattenBoard(
        { hLines: room.hLines, vLines: room.vLines, boxes: room.boxes },
        room.gridSize,
      );

      const newHLines = hLines.map(r => [...r]);
      const newVLines = vLines.map(r => [...r]);
      if (line.type === 'h') newHLines[line.row][line.col] = true;
      else                   newVLines[line.row][line.col] = true;

      const tempState = { hLines: newHLines, vLines: newVLines, boxes };
      const completed = getCompletedBoxes(tempState, line, room.gridSize);

      const newBoxes  = boxes.map(r => [...r]) as BoxOwner[][];
      const myPlayer: Player = isHost ? 1 : 2;
      completed.forEach(([r, c]) => { newBoxes[r][c] = myPlayer; });

      const myScore    = (isHost ? room.host.score : room.guest.score) + completed.length;
      const oppScore   = isHost ? room.guest.score : room.host.score;
      const totalBoxes = (room.gridSize - 1) ** 2;
      const isGameOver = (myScore + oppScore) === totalBoxes;

      const nextUid = completed.length > 0
        ? myUid
        : (isHost ? room.guest.uid! : room.host.uid);

      const hostScore  = isHost ? myScore  : oppScore;
      const guestScore = isHost ? oppScore : myScore;

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
      // Ignore turn conflict errors (stale tap)
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
    timerRemaining: 0,
    lastLine,
    drawLine,
    abandon,
    requestRematch,
  };
}
