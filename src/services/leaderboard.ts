import { query, collection, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from './firebase';

export interface LeaderboardEntry {
  uid:        string;
  displayName: string;
  onlineWins: number;
  onlineLosses: number;
  onlineDraws: number;
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    // `onlineWins` is a denormalised top-level field for efficient ordering.
    // Single-field indexes are created automatically by Firestore.
    const q    = query(collection(db, 'users'), orderBy('onlineWins', 'desc'), limit(20));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({
        uid:          d.id,
        displayName:  d.data().displayName ?? 'Player',
        onlineWins:   d.data().onlineWins  ?? 0,
        onlineLosses: d.data().stats?.onlineLosses ?? 0,
        onlineDraws:  d.data().stats?.onlineDraws  ?? 0,
      }))
      .filter(e => e.onlineWins > 0); // hide players who haven't won online yet
  } catch (e) {
    console.warn('[leaderboard] fetch failed:', e);
    return [];
  }
}
