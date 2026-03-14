import { getApps, initializeApp } from 'firebase/app';
// getReactNativePersistence is available in Metro's RN bundle but not browser types
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { initializeAuth, getAuth, getReactNativePersistence, signInAnonymously } = require('firebase/auth');
import { initializeFirestore, getFirestore, memoryLocalCache } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyA_dtLz8mZEyRVqQD_aDudsUPyN3K0-HS8',
  authDomain: 'dotsboxes-d05ea.firebaseapp.com',
  projectId: 'dotsboxes-d05ea',
  storageBucket: 'dotsboxes-d05ea.firebasestorage.app',
  messagingSenderId: '854900557322',
  appId: '1:854900557322:web:fe471e3d62f85b6d1c41f3',
};

// Guard against re-initialization during Fast Refresh
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

let _auth: any;
try {
  _auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
} catch {
  _auth = getAuth(app);
}
export const auth = _auth;

let _db: any;
try {
  _db = initializeFirestore(app, { localCache: memoryLocalCache() });
} catch {
  _db = getFirestore(app);
}
export const db = _db;

/** Sign in anonymously if needed and return the stable UID. */
export async function getAnonymousUid(): Promise<string> {
  if (auth.currentUser) return auth.currentUser.uid;
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}
