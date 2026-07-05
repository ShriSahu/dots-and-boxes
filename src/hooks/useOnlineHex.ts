import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { HexMove, HexOnlineRoom, HexState } from '../types/hex.types';
import {
  subscribeToHexRoom, applyHexOnlineMove, abandonHexRoom,
  hexHeartbeat, requestHexRematch as reqRematch,
} from '../services/hexRoom';
import { applyHexMove, isLegalHexMove } from '../utils/hexHelpers';
import { notifyYourTurn, requestNotificationPermissions } from '../services/notifications';

export interface OnlineHexEvents {
  onMove?: (move: HexMove, player: 1 | 2) => void;
  onTurnSwitch?: () => void;
  onGameOver?: () => void;
  onOpponentDisconnected?: () => void;
}

const HEARTBEAT_MS = 8000;
const STALE_MS      = 14000;
const GRACE_MS      = 45000;

function toMillis(ts: any): number | null {
  if (ts == null) return null;
  if (typeof ts === 'number') return ts;
  if (typeof ts?.toMillis === 'function') return ts.toMillis();
  return null;
}

export function useOnlineHex(
  roomCode: string,
  myUid: string,
  isHost: boolean,
  boardSize: 9 | 11 | 13,
  events: OnlineHexEvents = {},
) {
  const [room, setRoom]   = useState<HexOnlineRoom | null>(null);
  const [state, setState] = useState<HexState>(() => ({
    board: Array.from({ length: boardSize }, () => Array(boardSize).fill(0)),
    size: boardSize,
    currentPlayer: 1,
    winner: 0,
    isGameOver: false,
    history: [],
  }));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [opponentReconnecting, setOpponentReconnecting] = useState(false);
  const [graceSecondsRemaining, setGraceSecondsRemaining] = useState(0);
  const disconnectDetectedAtRef = useRef<number | null>(null);
  const graceExpiredHandledRef  = useRef(false);

  const prevMoveCount = useRef(-1);
  const prevStatus    = useRef<HexOnlineRoom['status'] | null>(null);
  const eventsRef     = useRef(events);
  eventsRef.current    = events;

  useEffect(() => {
    const unsub = subscribeToHexRoom(roomCode, r => {
      setRoom(r);

      if (prevMoveCount.current !== -1 && r.moveCount > prevMoveCount.current) {
        const movedUid = r.lastMove?.uid;
        const player: 1 | 2 = movedUid === r.host.uid ? 1 : 2;
        if (r.lastMove) {
          eventsRef.current.onMove?.({ row: r.lastMove.row, col: r.lastMove.col }, player);
        }
        if (r.currentPlayerUid !== movedUid) {
          setTimeout(() => eventsRef.current.onTurnSwitch?.(), 0);
          if (r.currentPlayerUid === myUid && AppState.currentState !== 'active') {
            notifyYourTurn(roomCode);
          }
        }
      }
      prevMoveCount.current = r.moveCount;

      setState({
        board: r.board,
        size: r.size,
        currentPlayer: r.currentPlayerUid === r.host.uid ? 1 : 2,
        winner: r.winner,
        isGameOver: r.status === 'finished',
        history: [],
      });

      if (prevStatus.current !== null && prevStatus.current !== r.status) {
        if (r.status === 'finished') setTimeout(() => eventsRef.current.onGameOver?.(), 50);
        if (r.status === 'abandoned') setTimeout(() => eventsRef.current.onOpponentDisconnected?.(), 0);
      }
      prevStatus.current = r.status;
    });
    return unsub;
  }, [roomCode]);

  const playMove = useCallback(async (move: HexMove) => {
    if (!room) return;
    if (room.currentPlayerUid !== myUid) return;
    if (room.status !== 'active') return;
    if (isSubmitting) return;

    const localState: HexState = {
      board: room.board, size: room.size, currentPlayer: isHost ? 1 : 2,
      winner: room.winner, isGameOver: false, history: [],
    };
    if (!isLegalHexMove(localState, move, room.size)) return;

    setIsSubmitting(true);
    try {
      const next = applyHexMove(localState, move);
      const nextUid = next.currentPlayer === 1 ? room.host.uid : room.guest.uid!;

      setState({
        board: next.board, size: next.size, currentPlayer: next.currentPlayer,
        winner: next.winner, isGameOver: next.isGameOver, history: [],
      });

      await applyHexOnlineMove(roomCode, move, myUid, nextUid, next.board, next.winner, next.isGameOver);
    } catch (_) {
      // Rejected (stale tap) — next snapshot reconciles.
    } finally {
      setIsSubmitting(false);
    }
  }, [room, myUid, isHost, roomCode, isSubmitting]);

  const abandon = useCallback(() => abandonHexRoom(roomCode), [roomCode]);

  const requestRematch = useCallback(async (): Promise<string | null> => {
    if (!room) return null;
    return reqRematch(roomCode, myUid, isHost);
  }, [room, roomCode, myUid, isHost]);

  useEffect(() => { requestNotificationPermissions(); }, []);

  useEffect(() => {
    if (room?.status !== 'active') return;
    const seat = isHost ? 'host' : 'guest';
    hexHeartbeat(roomCode, seat);
    const id = setInterval(() => hexHeartbeat(roomCode, seat), HEARTBEAT_MS);
    return () => clearInterval(id);
  }, [roomCode, isHost, room?.status]);

  useEffect(() => {
    if (!room || room.status !== 'active') {
      disconnectDetectedAtRef.current = null;
      graceExpiredHandledRef.current  = false;
      setOpponentReconnecting(false);
      setGraceSecondsRemaining(0);
      return;
    }

    const check = () => {
      const oppSeat = isHost ? room.guest : room.host;
      const lastMs  = toMillis(oppSeat?.lastActive);
      const stale   = oppSeat?.uid != null && lastMs != null && (Date.now() - lastMs) > STALE_MS;

      if (!stale) {
        disconnectDetectedAtRef.current = null;
        graceExpiredHandledRef.current  = false;
        setOpponentReconnecting(false);
        setGraceSecondsRemaining(0);
        return;
      }

      if (disconnectDetectedAtRef.current == null) disconnectDetectedAtRef.current = Date.now();
      const elapsed   = Date.now() - disconnectDetectedAtRef.current;
      const remaining = Math.max(0, Math.ceil((GRACE_MS - elapsed) / 1000));
      setOpponentReconnecting(true);
      setGraceSecondsRemaining(remaining);

      if (elapsed >= GRACE_MS && !graceExpiredHandledRef.current) {
        graceExpiredHandledRef.current = true;
        abandonHexRoom(roomCode).catch(() => {});
      }
    };

    check();
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, [room, isHost, roomCode]);

  const isMyTurn     = room?.currentPlayerUid === myUid && room?.status === 'active';
  const opponentName = room ? (isHost ? (room.guest.name ?? 'Waiting…') : room.host.name) : 'Waiting…';
  const myName       = room ? (isHost ? room.host.name : (room.guest.name ?? '')) : '';

  return {
    room, state, isMyTurn, isSubmitting, opponentName, myName,
    playMove, abandon, requestRematch, opponentReconnecting, graceSecondsRemaining,
  };
}
