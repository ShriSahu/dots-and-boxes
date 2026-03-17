import {
  doc, getDoc, setDoc, updateDoc,
  increment, addDoc, collection, onSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import type { UserProfile } from '../types/game.types';

export async function ensureUserProfile(uid: string, displayName: string): Promise<void> {
  const ref  = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      displayName,
      coins: 0,
      onlineWins: 0,
      createdAt:  new Date(),
      lastSeenAt: new Date(),
      stats: { onlineWins: 0, onlineLosses: 0, onlineDraws: 0 },
    });
  } else {
    await updateDoc(ref, { lastSeenAt: new Date() });
  }
}

export async function loadCoinBalance(uid: string): Promise<number> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data().coins ?? 0) : 0;
}

export function subscribeToBalance(uid: string, cb: (coins: number) => void): () => void {
  return onSnapshot(doc(db, 'users', uid), snap => {
    cb(snap.exists() ? (snap.data().coins ?? 0) : 0);
  });
}

export async function awardCoins(
  uid: string,
  delta: number,
  reason: 'win' | 'draw' | 'participation' | 'purchase' | 'bonus',
  roomCode: string | null = null,
): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { coins: increment(delta) });
  await addDoc(collection(db, 'coinTransactions'), {
    uid, delta, reason, roomCode, createdAt: new Date(),
  });
}

export async function spendCoins(
  uid: string,
  amount: number,
  reason: string,
): Promise<boolean> {
  const balance = await loadCoinBalance(uid);
  if (balance < amount) return false;
  await updateDoc(doc(db, 'users', uid), { coins: increment(-amount) });
  await addDoc(collection(db, 'coinTransactions'), {
    uid, delta: -amount, reason: 'purchase', roomCode: null, createdAt: new Date(),
  });
  return true;
}

export async function checkAndAwardDailyBonus(uid: string): Promise<number> {
  const snap = await getDoc(doc(db, 'users', uid));
  if (!snap.exists()) return 0;
  const data = snap.data();
  const last: Date | null = data.lastDailyBonus?.toDate?.() ?? null;
  const now  = new Date();
  if (!last || now.toDateString() !== last.toDateString()) {
    await updateDoc(doc(db, 'users', uid), {
      lastDailyBonus: now,
      coins: increment(5),
    });
    await addDoc(collection(db, 'coinTransactions'), {
      uid, delta: 5, reason: 'bonus', roomCode: null, createdAt: now,
    });
    return 5;
  }
  return 0;
}

/** Records the result of an online game: awards coins and updates stats. */
export async function recordOnlineResult(
  uid: string,
  result: 'win' | 'draw' | 'loss',
  roomCode: string,
): Promise<number> {
  const coinMap:   Record<string, number> = { win: 25, draw: 3, loss: 1 };
  const statField: Record<string, string> = {
    win:  'stats.onlineWins',
    draw: 'stats.onlineDraws',
    loss: 'stats.onlineLosses',
  };
  const coins  = coinMap[result];
  const reason = result === 'win' ? 'win' : result === 'draw' ? 'draw' : 'participation';

  await updateDoc(doc(db, 'users', uid), {
    coins: increment(coins),
    [statField[result]]: increment(1),
    // Denormalised top-level field for leaderboard queries
    ...(result === 'win' ? { onlineWins: increment(1) } : {}),
  });
  await addDoc(collection(db, 'coinTransactions'), {
    uid, delta: coins, reason, roomCode, createdAt: new Date(),
  });
  return coins;
}

export async function getPurchasedThemes(uid: string): Promise<string[]> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data().purchasedThemes ?? ['parchment']) : ['parchment'];
}

export async function purchaseTheme(uid: string, themeName: string, cost: number): Promise<boolean> {
  const ok = await spendCoins(uid, cost, `theme_${themeName}`);
  if (!ok) return false;
  const existing = await getPurchasedThemes(uid);
  if (!existing.includes(themeName)) {
    await updateDoc(doc(db, 'users', uid), {
      purchasedThemes: [...existing, themeName],
    });
  }
  return true;
}

export async function getActiveTheme(uid: string): Promise<string> {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? (snap.data().activeTheme ?? 'parchment') : 'parchment';
}

export async function setActiveTheme(uid: string, themeName: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), { activeTheme: themeName });
}
