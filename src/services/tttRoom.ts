import {
  doc, setDoc, getDoc, updateDoc, onSnapshot,
  runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { TTTOnlineRoom, TTTMove, TTTCell, TTTBoardResult } from '../types/ttt.types';
import { generateRoomCode } from './gameRoom';

const COLLECTION = 'ttt_rooms';

function emptyBoards(): TTTCell[][] {
  return Array.from({ length: 9 }, () => Array(9).fill(0) as TTTCell[]);
}

export async function createTTTRoom(hostUid: string, hostName: string): Promise<string> {
  let roomCode = generateRoomCode();
  for (let i = 0; i < 5; i++) {
    const snap = await getDoc(doc(db, COLLECTION, roomCode));
    if (!snap.exists()) break;
    roomCode = generateRoomCode();
  }

  const room: Omit<TTTOnlineRoom, 'roomCode'> = {
    status: 'waiting',
    boards: emptyBoards(),
    boardResults: Array(9).fill(0) as TTTBoardResult[],
    activeBoard: null,
    host:  { uid: hostUid, name: hostName, lastActive: serverTimestamp() },
    guest: { uid: null, name: null },
    currentPlayerUid: hostUid,
    moveCount: 0,
    winner: 0,
    lastMove: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    rematchRequestedBy: null,
    rematchRoomCode: null,
  };

  await setDoc(doc(db, COLLECTION, roomCode), room);
  return roomCode;
}

export async function joinTTTRoom(
  roomCode: string,
  guestUid: string,
  guestName: string,
): Promise<{ room: TTTOnlineRoom; isHost: boolean }> {
  const ref = doc(db, COLLECTION, roomCode.toUpperCase());

  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Room not found. Check the code and try again.');
    const data = snap.data() as TTTOnlineRoom;

    if (data.host.uid === guestUid) {
      if (data.status === 'finished' || data.status === 'abandoned') {
        throw new Error('That game has already ended.');
      }
      return { room: { ...data, roomCode }, isHost: true };
    }
    if (data.guest.uid === guestUid) {
      if (data.status === 'finished' || data.status === 'abandoned') {
        throw new Error('That game has already ended.');
      }
      return { room: { ...data, roomCode }, isHost: false };
    }

    if (data.status !== 'waiting') throw new Error('Room is full or game already started.');

    const guest = { uid: guestUid, name: guestName, lastActive: serverTimestamp() };
    tx.update(ref, { guest, status: 'active', updatedAt: serverTimestamp() });

    return { room: { ...data, roomCode, guest, status: 'active' as const }, isHost: false };
  });
}

export async function peekTTTRoom(roomCode: string): Promise<TTTOnlineRoom | null> {
  const snap = await getDoc(doc(db, COLLECTION, roomCode.toUpperCase()));
  return snap.exists() ? { ...(snap.data() as TTTOnlineRoom), roomCode: snap.id } : null;
}

export async function ttTHeartbeat(roomCode: string, seat: 'host' | 'guest'): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTION, roomCode.toUpperCase()), {
      [`${seat}.lastActive`]: serverTimestamp(),
    });
  } catch (_) {}
}

export function subscribeToTTTRoom(
  roomCode: string,
  cb: (room: TTTOnlineRoom) => void,
): () => void {
  return onSnapshot(doc(db, COLLECTION, roomCode.toUpperCase()), snap => {
    if (snap.exists()) cb({ ...(snap.data() as TTTOnlineRoom), roomCode: snap.id });
  });
}

export async function applyTTTOnlineMove(
  roomCode: string,
  move: TTTMove,
  myUid: string,
  nextPlayerUid: string,
  newBoards: TTTCell[][],
  newBoardResults: TTTBoardResult[],
  newActiveBoard: number | null,
  winner: TTTBoardResult,
  isGameOver: boolean,
): Promise<void> {
  const ref = doc(db, COLLECTION, roomCode.toUpperCase());

  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Room not found');
    const data = snap.data() as TTTOnlineRoom;
    if (data.currentPlayerUid !== myUid) throw new Error('Not your turn');
    if (data.status !== 'active') throw new Error('Game not active');

    tx.update(ref, {
      boards: newBoards,
      boardResults: newBoardResults,
      activeBoard: newActiveBoard,
      currentPlayerUid: nextPlayerUid,
      moveCount: data.moveCount + 1,
      lastMove: { ...move, uid: myUid },
      winner,
      status: isGameOver ? 'finished' : 'active',
      updatedAt: serverTimestamp(),
    });
  });
}

export async function abandonTTTRoom(roomCode: string): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTION, roomCode.toUpperCase()), {
      status: 'abandoned',
      updatedAt: serverTimestamp(),
    });
  } catch (_) {}
}

export async function requestTTTRematch(
  roomCode: string,
  myUid: string,
  isHost: boolean,
): Promise<string | null> {
  const ref = doc(db, COLLECTION, roomCode.toUpperCase());

  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return null;
    const data = snap.data() as TTTOnlineRoom;

    if (data.rematchRequestedBy && data.rematchRequestedBy !== myUid) {
      const newCode = generateRoomCode();
      const newHostUid  = isHost ? data.guest.uid!  : data.host.uid;
      const newHostName = isHost ? data.guest.name! : data.host.name;
      const newGuestUid  = isHost ? data.host.uid  : data.guest.uid!;
      const newGuestName = isHost ? data.host.name : data.guest.name!;

      tx.set(doc(db, COLLECTION, newCode), {
        status: 'active',
        boards: emptyBoards(),
        boardResults: Array(9).fill(0),
        activeBoard: null,
        host:  { uid: newHostUid,  name: newHostName,  lastActive: serverTimestamp() },
        guest: { uid: newGuestUid, name: newGuestName, lastActive: serverTimestamp() },
        currentPlayerUid: newHostUid,
        moveCount: 0,
        winner: 0,
        lastMove: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        rematchRequestedBy: null,
        rematchRoomCode: null,
      });
      tx.update(ref, { rematchRoomCode: newCode, updatedAt: serverTimestamp() });
      return newCode;
    }

    tx.update(ref, { rematchRequestedBy: myUid, updatedAt: serverTimestamp() });
    return null;
  });
}
