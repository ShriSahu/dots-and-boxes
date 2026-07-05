import {
  doc, setDoc, getDoc, updateDoc, onSnapshot,
  runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { HexOnlineRoom, HexMove, HexCell, HexBoardSize, HexPlayer } from '../types/hex.types';
import { generateRoomCode } from './gameRoom';

const COLLECTION = 'hex_rooms';

function emptyBoard(size: HexBoardSize): HexCell[][] {
  return Array.from({ length: size }, () => Array(size).fill(0) as HexCell[]);
}

export async function createHexRoom(hostUid: string, hostName: string, size: HexBoardSize): Promise<string> {
  let roomCode = generateRoomCode();
  for (let i = 0; i < 5; i++) {
    const snap = await getDoc(doc(db, COLLECTION, roomCode));
    if (!snap.exists()) break;
    roomCode = generateRoomCode();
  }

  const room: Omit<HexOnlineRoom, 'roomCode'> = {
    status: 'waiting',
    board: emptyBoard(size),
    size,
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

export async function joinHexRoom(
  roomCode: string,
  guestUid: string,
  guestName: string,
): Promise<{ room: HexOnlineRoom; isHost: boolean }> {
  const ref = doc(db, COLLECTION, roomCode.toUpperCase());

  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Room not found. Check the code and try again.');
    const data = snap.data() as HexOnlineRoom;

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

export function subscribeToHexRoom(
  roomCode: string,
  cb: (room: HexOnlineRoom) => void,
): () => void {
  return onSnapshot(doc(db, COLLECTION, roomCode.toUpperCase()), snap => {
    if (snap.exists()) cb({ ...(snap.data() as HexOnlineRoom), roomCode: snap.id });
  });
}

export async function hexHeartbeat(roomCode: string, seat: 'host' | 'guest'): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTION, roomCode.toUpperCase()), {
      [`${seat}.lastActive`]: serverTimestamp(),
    });
  } catch (_) {}
}

export async function applyHexOnlineMove(
  roomCode: string,
  move: HexMove,
  myUid: string,
  nextPlayerUid: string,
  newBoard: HexCell[][],
  winner: 0 | HexPlayer,
  isGameOver: boolean,
): Promise<void> {
  const ref = doc(db, COLLECTION, roomCode.toUpperCase());

  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Room not found');
    const data = snap.data() as HexOnlineRoom;
    if (data.currentPlayerUid !== myUid) throw new Error('Not your turn');
    if (data.status !== 'active') throw new Error('Game not active');

    tx.update(ref, {
      board: newBoard,
      currentPlayerUid: nextPlayerUid,
      moveCount: data.moveCount + 1,
      lastMove: { ...move, uid: myUid },
      winner,
      status: isGameOver ? 'finished' : 'active',
      updatedAt: serverTimestamp(),
    });
  });
}

export async function abandonHexRoom(roomCode: string): Promise<void> {
  try {
    await updateDoc(doc(db, COLLECTION, roomCode.toUpperCase()), {
      status: 'abandoned',
      updatedAt: serverTimestamp(),
    });
  } catch (_) {}
}

export async function requestHexRematch(
  roomCode: string,
  myUid: string,
  isHost: boolean,
): Promise<string | null> {
  const ref = doc(db, COLLECTION, roomCode.toUpperCase());

  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return null;
    const data = snap.data() as HexOnlineRoom;

    if (data.rematchRequestedBy && data.rematchRequestedBy !== myUid) {
      const newCode = generateRoomCode();
      const newHostUid  = isHost ? data.guest.uid!  : data.host.uid;
      const newHostName = isHost ? data.guest.name! : data.host.name;
      const newGuestUid  = isHost ? data.host.uid  : data.guest.uid!;
      const newGuestName = isHost ? data.host.name : data.guest.name!;

      tx.set(doc(db, COLLECTION, newCode), {
        status: 'active',
        board: emptyBoard(data.size),
        size: data.size,
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
