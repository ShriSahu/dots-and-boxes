import {
  doc, setDoc, updateDoc, collection,
  query, where, orderBy, limit,
  onSnapshot, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { buildInitialRoomDoc } from './gameRoom';
import type { GridSize, MatchmakingDoc } from '../types/game.types';

const MATCHMAKING = 'matchmaking';
const ROOMS       = 'rooms';

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** 4-letter uppercase room code (A-Z only, easy to type). */
export function generateMatchCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ── Queue operations ──────────────────────────────────────────────────────────

export async function joinQueue(
  uid: string,
  name: string,
  gridSize: GridSize,
): Promise<void> {
  await setDoc(doc(db, MATCHMAKING, uid), {
    uid,
    name,
    gridSize,
    joinedAt: serverTimestamp(),
    status: 'waiting',
    roomCode: null,
    matchedGridSize: null,
    hostUid: null,
  } as Omit<MatchmakingDoc, 'joinedAt'> & { joinedAt: any });
}

export async function cancelQueue(uid: string): Promise<void> {
  try {
    await updateDoc(doc(db, MATCHMAKING, uid), { status: 'cancelled' });
  } catch (_) {}
}

// ── Subscribe to own matchmaking doc ──────────────────────────────────────────

export function subscribeToMyMatch(
  uid: string,
  onMatched: (roomCode: string, matchedGridSize: GridSize, isHost: boolean) => void,
): () => void {
  return onSnapshot(doc(db, MATCHMAKING, uid), snap => {
    if (!snap.exists()) return;
    const data = snap.data() as MatchmakingDoc;
    if (data.status === 'matched' && data.roomCode && data.matchedGridSize && data.hostUid) {
      // isHost is derived from hostUid written by the transaction — no race condition
      const isHost = data.hostUid === uid;
      onMatched(data.roomCode, data.matchedGridSize, isHost);
    }
  });
}

// ── Subscribe to waiting pool and attempt match ───────────────────────────────

export function subscribeToWaitingPool(
  myUid: string,
  onPartnerFound: (partnerUid: string) => void,
): () => void {
  const q = query(
    collection(db, MATCHMAKING),
    where('status', '==', 'waiting'),
    orderBy('joinedAt', 'asc'),
    limit(2),
  );

  return onSnapshot(q, snapshot => {
    const docs = snapshot.docs.map(d => d.data() as MatchmakingDoc);
    if (docs.length < 2) return;
    // Both slots filled — attempt match
    const uidA = docs[0].uid;
    const uidB = docs[1].uid;
    if (uidA !== myUid && uidB !== myUid) return; // neither is me
    const partnerUid = uidA === myUid ? uidB : uidA;
    onPartnerFound(partnerUid);
  });
}

// ── Matching transaction ───────────────────────────────────────────────────────

export async function attemptMatch(myUid: string, partnerUid: string): Promise<void> {
  // Host = lexicographically smaller uid
  const hostUid   = myUid < partnerUid ? myUid   : partnerUid;
  const guestUid  = myUid < partnerUid ? partnerUid : myUid;

  const myRef      = doc(db, MATCHMAKING, myUid);
  const partnerRef = doc(db, MATCHMAKING, partnerUid);

  try {
    await runTransaction(db, async tx => {
      const mySnap      = await tx.get(myRef);
      const partnerSnap = await tx.get(partnerRef);

      if (!mySnap.exists() || !partnerSnap.exists()) throw new Error('doc missing');

      const myData      = mySnap.data()      as MatchmakingDoc;
      const partnerData = partnerSnap.data() as MatchmakingDoc;

      // Guard: both must still be waiting
      if (myData.status !== 'waiting')      throw new Error('already matched');
      if (partnerData.status !== 'waiting') throw new Error('already matched');

      // Guard: both must have joined recently (< 40s ago)
      const now = Date.now();
      const myJoined      = myData.joinedAt?.toMillis?.() ?? 0;
      const partnerJoined = partnerData.joinedAt?.toMillis?.() ?? 0;
      if (now - myJoined      > 40_000) throw new Error('stale');
      if (now - partnerJoined > 40_000) throw new Error('stale');

      const hostName   = myUid === hostUid   ? myData.name      : partnerData.name;
      const guestName  = myUid === guestUid  ? myData.name      : partnerData.name;
      const resolvedGrid = Math.min(myData.gridSize, partnerData.gridSize) as GridSize;
      const roomCode   = generateMatchCode();

      // Write room doc directly in transaction (no Firestore reads needed)
      const roomDoc = buildInitialRoomDoc(hostUid, hostName, guestUid, guestName, resolvedGrid);
      tx.set(doc(db, ROOMS, roomCode), roomDoc);

      // Update both matchmaking docs — write hostUid so both clients derive isHost reliably
      tx.update(myRef,      { status: 'matched', roomCode, matchedGridSize: resolvedGrid, hostUid });
      tx.update(partnerRef, { status: 'matched', roomCode, matchedGridSize: resolvedGrid, hostUid });
    });
  } catch (_) {
    // Transaction failed (already matched, stale, or conflict) — ignore silently
  }
}
