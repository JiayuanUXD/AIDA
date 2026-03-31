import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore, initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use initializeFirestore with long polling to bypass potential network restrictions in the iframe
let firestoreDb;
const databaseId = (firebaseConfig as any).firestoreDatabaseId || '(default)';

try {
  firestoreDb = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    experimentalAutoDetectLongPolling: true,
    ignoreUndefinedProperties: true,
  }, databaseId);
  console.log(`Firestore initialized with database: ${databaseId}`);
} catch (e) {
  firestoreDb = getFirestore(app, databaseId);
}

export const db = firestoreDb;
export const storage = getStorage(app);

// In local development we want to run without manual login.
// This will sign in anonymously so Firestore security rules treat the request as authenticated.
export async function ensureDevAnonymousAuth() {
  if (import.meta.env.PROD) return;
  if (auth.currentUser) return;
  await signInAnonymously(auth);
}
