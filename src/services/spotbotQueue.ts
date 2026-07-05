import {
  doc, setDoc, updateDoc, collection,
  query, where, orderBy, limit,
  onSnapshot, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { generateRoomCode } from './gameRoom';

const QUEUE = 'spotbot_queue';
const ROOMS = 'spotbot_rooms';

interface QueueDoc {
  uid: string;
  name: string;
  joinedAt: any;
  status: 'waiting' | 'matched' | 'cancelled';
  roomCode: string | null;
  hostUid: string | null;
}

export async function joinSpotBotQueue(uid: string, name: string): Promise<void> {
  await setDoc(doc(db, QUEUE, uid), {
    uid, name, joinedAt: serverTimestamp(),
    status: 'waiting', roomCode: null, hostUid: null,
  } as QueueDoc);
}

export async function cancelSpotBotQueue(uid: string): Promise<void> {
  try { await updateDoc(doc(db, QUEUE, uid), { status: 'cancelled' }); } catch (_) {}
}

export function subscribeToMySpotBotMatch(
  uid: string,
  onMatched: (roomCode: string, isHost: boolean) => void,
): () => void {
  return onSnapshot(doc(db, QUEUE, uid), snap => {
    if (!snap.exists()) return;
    const data = snap.data() as QueueDoc;
    if (data.status === 'matched' && data.roomCode && data.hostUid) {
      onMatched(data.roomCode, data.hostUid === uid);
    }
  });
}

export function subscribeToSpotBotWaitingPool(
  myUid: string,
  onPartnerFound: (partnerUid: string) => void,
): () => void {
  const q = query(
    collection(db, QUEUE),
    where('status', '==', 'waiting'),
    orderBy('joinedAt', 'asc'),
    limit(2),
  );

  return onSnapshot(q, snapshot => {
    const docs = snapshot.docs.map(d => d.data() as QueueDoc);
    if (docs.length < 2) return;
    const uidA = docs[0].uid;
    const uidB = docs[1].uid;
    if (uidA !== myUid && uidB !== myUid) return;
    const partnerUid = uidA === myUid ? uidB : uidA;
    onPartnerFound(partnerUid);
  });
}

export async function attemptSpotBotMatch(myUid: string, partnerUid: string): Promise<void> {
  const hostUid  = myUid < partnerUid ? myUid : partnerUid;
  const guestUid = myUid < partnerUid ? partnerUid : myUid;

  const myRef      = doc(db, QUEUE, myUid);
  const partnerRef = doc(db, QUEUE, partnerUid);

  try {
    await runTransaction(db, async tx => {
      const mySnap      = await tx.get(myRef);
      const partnerSnap = await tx.get(partnerRef);
      if (!mySnap.exists() || !partnerSnap.exists()) throw new Error('doc missing');

      const myData      = mySnap.data()      as QueueDoc;
      const partnerData = partnerSnap.data() as QueueDoc;
      if (myData.status !== 'waiting')      throw new Error('already matched');
      if (partnerData.status !== 'waiting') throw new Error('already matched');

      const now = Date.now();
      const myJoined      = myData.joinedAt?.toMillis?.()      ?? 0;
      const partnerJoined = partnerData.joinedAt?.toMillis?.() ?? 0;
      if (now - myJoined      > 20_000) throw new Error('stale');
      if (now - partnerJoined > 20_000) throw new Error('stale');

      const hostName  = myUid === hostUid  ? myData.name : partnerData.name;
      const guestName = myUid === guestUid ? myData.name : partnerData.name;
      const roomCode  = generateRoomCode();

      tx.set(doc(db, ROOMS, roomCode), {
        status: 'active',
        cells: Array(9).fill(0),
        host:  { uid: hostUid,  name: hostName },
        guest: { uid: guestUid, name: guestName },
        currentPlayerUid: hostUid,
        moveCount: 0,
        result: 0,
        lastMove: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      tx.update(myRef,      { status: 'matched', roomCode, hostUid });
      tx.update(partnerRef, { status: 'matched', roomCode, hostUid });
    });
  } catch (_) {
    // Already matched / stale / conflict — ignore silently, caller keeps waiting or times out.
  }
}
