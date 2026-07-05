import { doc, updateDoc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import type { SpotBotOnlineRoom } from '../types/spotbot.types';
import type { TTTCell, TTTBoardResult } from '../types/ttt.types';

const ROOMS = 'spotbot_rooms';

export function subscribeToSpotBotRoom(
  roomCode: string,
  cb: (room: SpotBotOnlineRoom) => void,
): () => void {
  return onSnapshot(doc(db, ROOMS, roomCode.toUpperCase()), snap => {
    if (snap.exists()) cb({ ...(snap.data() as SpotBotOnlineRoom), roomCode: snap.id });
  });
}

export async function applySpotBotOnlineMove(
  roomCode: string,
  cell: number,
  myUid: string,
  nextPlayerUid: string,
  newCells: TTTCell[],
  result: TTTBoardResult,
  isOver: boolean,
): Promise<void> {
  const ref = doc(db, ROOMS, roomCode.toUpperCase());

  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Room not found');
    const data = snap.data() as SpotBotOnlineRoom;
    if (data.currentPlayerUid !== myUid) throw new Error('Not your turn');
    if (data.status !== 'active') throw new Error('Game not active');

    tx.update(ref, {
      cells: newCells,
      currentPlayerUid: nextPlayerUid,
      moveCount: data.moveCount + 1,
      lastMove: { cell, uid: myUid },
      result,
      status: isOver ? 'finished' : 'active',
      updatedAt: serverTimestamp(),
    });
  });
}

export async function abandonSpotBotRoom(roomCode: string): Promise<void> {
  try {
    await updateDoc(doc(db, ROOMS, roomCode.toUpperCase()), {
      status: 'abandoned',
      updatedAt: serverTimestamp(),
    });
  } catch (_) {}
}
