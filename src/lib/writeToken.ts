/** Shared Spark writeToken for client SDK writes (Menu admin + bot). */
export function getWriteToken(): string | null {
  const t = import.meta.env.VITE_FIREBASE_WRITE_TOKEN as string | undefined
  if (!t || t.includes('YOUR_') || t.length < 8) return null
  return t
}

export function requireWriteToken(): string {
  const t = getWriteToken()
  if (!t) {
    throw new Error('Missing VITE_FIREBASE_WRITE_TOKEN — cannot write to Firestore')
  }
  return t
}
