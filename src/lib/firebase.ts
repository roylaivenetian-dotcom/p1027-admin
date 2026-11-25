import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getFirestore, type Firestore } from 'firebase/firestore'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

export const firebaseConfigured = Boolean(
  config.apiKey && config.projectId && config.appId && !config.apiKey.includes('YOUR_'),
)

let app: FirebaseApp | null = null
let db: Firestore | null = null

export function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseConfigured) return null
  if (!app) app = initializeApp(config)
  return app
}

export function getDb(): Firestore | null {
  if (!firebaseConfigured) return null
  if (!db) {
    const a = getFirebaseApp()
    if (!a) return null
    db = getFirestore(a)
  }
  return db
}

export function firebaseConfigSummary(): string {
  if (!firebaseConfigured) return 'Not configured — using local mock data'
  return `projectId=${config.projectId}`
}
