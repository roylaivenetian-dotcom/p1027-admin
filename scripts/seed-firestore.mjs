/**
 * Seed people + menuItems into Firestore (Admin via REST is not used here).
 * Prefer: firebase emulators or console import.
 *
 * This script prints the documents the whatsapp-food-feed bot / console should write.
 * For a real Admin seed, set GOOGLE_APPLICATION_CREDENTIALS and run with firebase-admin.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// Re-export seed shapes from built-in JSON mirrors
const people = [
  { id: 'ken', name: 'Ken', active: true, sortOrder: 1 },
  { id: 'roy', name: 'Roy', active: true, sortOrder: 2 },
  { id: 'jason', name: 'Jason', active: true, sortOrder: 3 },
  { id: 'mandy', name: 'Mandy', active: true, sortOrder: 4 },
  { id: 'venus', name: 'Venus', active: true, sortOrder: 5 },
  { id: 'billy', name: 'Billy', active: true, sortOrder: 6 },
  { id: 'alice', name: 'Alice', active: true, sortOrder: 7 },
  { id: 'tom', name: 'Tom', active: true, sortOrder: 8 },
]

console.log('Seed plan for project sick-meal')
console.log('Collections: people, menuItems')
console.log(JSON.stringify({ peopleCount: people.length }, null, 2))
console.log('Use Firebase console or Admin SDK from whatsapp-food-feed to write these docs.')
console.log('Web app falls back to local mock until people/menuItems exist.')

try {
  const env = readFileSync(resolve(root, '.env.local'), 'utf8')
  const project = env.match(/VITE_FIREBASE_PROJECT_ID=(.+)/)?.[1]
  console.log('Configured project:', project)
} catch {
  console.log('No .env.local found')
}
