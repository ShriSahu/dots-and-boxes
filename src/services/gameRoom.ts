import {
  doc, setDoc, getDoc, updateDoc, onSnapshot,
  runTransaction, serverTimestamp, increment,
} from 'firebase/firestore';
import { db } from './firebase';
import type { OnlineRoom, GridSize, TimerOption, LineId, BoxOwner } from '../types/game.types';

// ── Helpers ──────────────────────────────────────────────────────────────────

export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function flattenHLines(hLines: boolean[][], gridSize: GridSize): boolean[] {
  return hLines.flat();
}

export function flattenVLines(vLines: boolean[][], gridSize: GridSize): boolean[] {
  return vLines.flat();
}

export function unflattenBoard(
  flat: { hLines: boolean[]; vLines: boolean[]; boxes: number[] },
  gridSize: GridSize,
) {
  const dots = gridSize;
  const cells = gridSize - 1;
  const hLines: boolean[][] = [];
  const vLines: boolean[][] = [];
  const boxes: BoxOwner[][] = [];

  for (let r = 0; r < dots; r++) {
    hLines.push(flat.hLines.slice(r * cells, r * cells + cells));
  }
  for (let r = 0; r < cells; r++) {
    vLines.push(flat.vLines.slice(r * dots, r * dots + dots));
  }
  for (let r = 0; r < cells; r++) {
    boxes.push(flat.boxes.slice(r * cells, r * cells + cells) as BoxOwner[]);
  }

  return { hLines, vLines, boxes };
}

function emptyBoard(gridSize: GridSize) {
  const dots = gridSize;
  const cells = gridSize - 1;
  return {
    hLines: new Array(dots * cells).fill(false) as boolean[],
    vLines: new Array(cells * dots).fill(false) as boolean[],
    boxes: new Array(cells * cells).fill(0) as number[],
  };
}

// ── Room operations ───────────────────────────────────────────────────────────

export async function createRoom(
  hostUid: string,
  hostName: string,
  gridSize: GridSize,
): Promise<string> {
  let roomCode = generateRoomCode();
  // Ensure uniqueness (max 5 tries)
  for (let i = 0; i < 5; i++) {
    const snap = await getDoc(doc(db, 'rooms', roomCode));
    if (!snap.exists()) break;
    roomCode = generateRoomCode();
  }

  const board = emptyBoard(gridSize);
  const room: Omit<OnlineRoom, 'roomCode'> = {
    status: 'waiting',
    gridSize,
    timerSeconds: 0,
    host: { uid: hostUid, name: hostName, score: 0 },
    guest: { uid: null, name: null, score: 0 },
    currentPlayerUid: hostUid,
    moveCount: 0,
    ...board,
    lastMove: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    rematchRequestedBy: null,
    rematchRoomCode: null,
    turnStartedAt: null,
  };

  await setDoc(doc(db, 'rooms', roomCode), room);
  return roomCode;
}

export async function joinRoom(
  roomCode: string,
  guestUid: string,
  guestName: string,
): Promise<OnlineRoom> {
  const ref = doc(db, 'rooms', roomCode.toUpperCase());

  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Room not found. Check the code and try again.');
    const data = snap.data() as OnlineRoom;
    if (data.status !== 'waiting') throw new Error('Room is full or game already started.');
    if (data.host.uid === guestUid) throw new Error('Cannot join your own room.');

    tx.update(ref, {
      guest: { uid: guestUid, name: guestName, score: 0 },
      status: 'active',
      updatedAt: serverTimestamp(),
    });

    return {
      ...data,
      roomCode,
      guest: { uid: guestUid, name: guestName, score: 0 },
      status: 'active' as const,
    };
  });
}

export function subscribeToRoom(
  roomCode: string,
  cb: (room: OnlineRoom) => void,
): () => void {
  return onSnapshot(doc(db, 'rooms', roomCode.toUpperCase()), snap => {
    if (snap.exists()) cb({ ...(snap.data() as OnlineRoom), roomCode: snap.id });
  });
}

export async function applyMove(
  roomCode: string,
  move: LineId,
  myUid: string,
  nextPlayerUid: string,
  newHLines: boolean[],
  newVLines: boolean[],
  newBoxes: number[],
  hostScore: number,
  guestScore: number,
  isGameOver: boolean,
): Promise<void> {
  const ref = doc(db, 'rooms', roomCode.toUpperCase());

  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Room not found');
    const data = snap.data() as OnlineRoom;
    if (data.currentPlayerUid !== myUid) throw new Error('Not your turn');
    if (data.status !== 'active') throw new Error('Game not active');

    tx.update(ref, {
      hLines: newHLines,
      vLines: newVLines,
      boxes: newBoxes,
      currentPlayerUid: nextPlayerUid,
      moveCount: data.moveCount + 1,
      lastMove: { ...move, uid: myUid },
      'host.score': hostScore,
      'guest.score': guestScore,
      status: isGameOver ? 'finished' : 'active',
      updatedAt: serverTimestamp(),
      turnStartedAt: serverTimestamp(),
    });
  });
}

export async function skipTurn(
  roomCode: string,
  myUid: string,
): Promise<void> {
  const ref = doc(db, 'rooms', roomCode.toUpperCase());

  await runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Room not found');
    const data = snap.data() as OnlineRoom;
    if (data.currentPlayerUid !== myUid) throw new Error('Not your turn');
    if (data.status !== 'active') throw new Error('Game not active');

    const nextUid = myUid === data.host.uid ? data.guest.uid! : data.host.uid;

    tx.update(ref, {
      currentPlayerUid: nextUid,
      moveCount: increment(1),
      lastMove: { type: 'skip', row: -1, col: -1, uid: myUid },
      updatedAt: serverTimestamp(),
      turnStartedAt: serverTimestamp(),
    });
  });
}

/** Pure function — no Firestore reads. Used by matchmaking transaction. */
export function buildInitialRoomDoc(
  hostUid: string,
  hostName: string,
  guestUid: string,
  guestName: string,
  gridSize: GridSize,
) {
  const board = emptyBoard(gridSize);
  return {
    status: 'active' as const,
    gridSize,
    timerSeconds: 15 as TimerOption,
    host:  { uid: hostUid,  name: hostName,  score: 0 },
    guest: { uid: guestUid, name: guestName, score: 0 },
    currentPlayerUid: hostUid,
    moveCount: 0,
    ...board,
    lastMove: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    rematchRequestedBy: null,
    rematchRoomCode: null,
    turnStartedAt: serverTimestamp(),
  };
}

export async function abandonRoom(roomCode: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'rooms', roomCode.toUpperCase()), {
      status: 'abandoned',
      updatedAt: serverTimestamp(),
    });
  } catch (_) {}
}

export async function requestRematch(
  roomCode: string,
  myUid: string,
  myName: string,
  isHost: boolean,
  gridSize: GridSize,
): Promise<string | null> {
  const ref = doc(db, 'rooms', roomCode.toUpperCase());

  return runTransaction(db, async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return null;
    const data = snap.data() as OnlineRoom;

    // Both players want rematch — create new room
    if (data.rematchRequestedBy && data.rematchRequestedBy !== myUid) {
      const newCode = generateRoomCode();
      const board = emptyBoard(gridSize);
      // Swap roles for rematch
      const newHostUid  = isHost ? data.guest.uid!  : data.host.uid;
      const newHostName = isHost ? data.guest.name! : data.host.name;
      const newGuestUid  = isHost ? data.host.uid  : data.guest.uid!;
      const newGuestName = isHost ? data.host.name : data.guest.name!;

      tx.set(doc(db, 'rooms', newCode), {
        status: 'active',
        gridSize: data.gridSize,
        timerSeconds: 0,
        host:  { uid: newHostUid,  name: newHostName,  score: 0 },
        guest: { uid: newGuestUid, name: newGuestName, score: 0 },
        currentPlayerUid: newHostUid,
        moveCount: 0,
        ...board,
        lastMove: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        rematchRequestedBy: null,
        rematchRoomCode: null,
      });
      tx.update(ref, { rematchRoomCode: newCode, updatedAt: serverTimestamp() });
      return newCode;
    }

    // First rematch request
    tx.update(ref, { rematchRequestedBy: myUid, updatedAt: serverTimestamp() });
    return null;
  });
}
