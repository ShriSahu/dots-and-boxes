import { useCallback, useEffect, useRef, useState } from 'react';
import { SpotBotOnlineRoom, SpotBotRoundState } from '../types/spotbot.types';
import { subscribeToSpotBotRoom, applySpotBotOnlineMove, abandonSpotBotRoom } from '../services/spotbotRoom';
import { applySpotBotMove, isLegalSpotBotMove } from '../utils/spotBotHelpers';

export interface SpotBotOnlineRoundEvents {
  onGameOver?: () => void;
  onOpponentDisconnected?: () => void;
}

/** Drives a round against a matched human opponent via a spotbot_rooms Firestore doc. */
export function useSpotBotOnlineRound(
  roomCode: string,
  myUid: string,
  isHost: boolean,
  events: SpotBotOnlineRoundEvents = {},
) {
  const [room, setRoom]   = useState<SpotBotOnlineRoom | null>(null);
  const [state, setState] = useState<SpotBotRoundState>({
    cells: Array(9).fill(0), currentPlayer: 1, result: 0, isOver: false, history: [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const prevStatus = useRef<SpotBotOnlineRoom['status'] | null>(null);
  const eventsRef   = useRef(events);
  eventsRef.current = events;

  useEffect(() => {
    if (!roomCode) return;
    const unsub = subscribeToSpotBotRoom(roomCode, r => {
      setRoom(r);
      setState({
        cells: r.cells,
        currentPlayer: r.currentPlayerUid === r.host.uid ? 1 : 2,
        result: r.result,
        isOver: r.status === 'finished',
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

  const playMove = useCallback(async (cell: number) => {
    if (!room) return;
    if (room.currentPlayerUid !== myUid) return;
    if (room.status !== 'active') return;
    if (isSubmitting) return;

    const localState: SpotBotRoundState = {
      cells: room.cells, currentPlayer: isHost ? 1 : 2, result: room.result, isOver: false, history: [],
    };
    if (!isLegalSpotBotMove(localState, cell)) return;

    setIsSubmitting(true);
    try {
      const next = applySpotBotMove(localState, cell);
      const nextUid = next.currentPlayer === 1 ? room.host.uid : room.guest.uid;

      setState({ cells: next.cells, currentPlayer: next.currentPlayer, result: next.result, isOver: next.isOver, history: [] });

      await applySpotBotOnlineMove(roomCode, cell, myUid, nextUid, next.cells, next.result, next.isOver);
    } catch (_) {
      // Rejected — next snapshot reconciles.
    } finally {
      setIsSubmitting(false);
    }
  }, [room, myUid, isHost, roomCode, isSubmitting]);

  const abandon = useCallback(() => abandonSpotBotRoom(roomCode), [roomCode]);

  const isMyTurn = room?.currentPlayerUid === myUid && room?.status === 'active';
  const opponentName = room ? (isHost ? room.guest.name : room.host.name) : 'Opponent';

  return { room, state, isMyTurn, isSubmitting, opponentName, playMove, abandon };
}
