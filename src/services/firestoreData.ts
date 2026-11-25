import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore'
import type {
  CreateLeavePayload,
  FoodOrderDoc,
  LeaveRecordDoc,
  MenuItem,
  MenuPhotoDoc,
  MenuVisionDish,
  MenuVisionJobDoc,
  MenuVisionJobStatus,
  Person,
  UpsertOrderPayload,
} from '../types'
import { buildOrderDoc } from '../lib/pricing'
import { getDb, firebaseConfigured } from '../lib/firebase'
import { requireWriteToken } from '../lib/writeToken'
import { dayBeforeIso } from '../lib/menuDates'

/** Collection names — must match shared Bot feed contract. */
export const COLLECTIONS = {
  people: 'people',
  menuItems: 'menuItems',
  menuPhotos: 'menuPhotos',
  menuVisionJobs: 'menuVisionJobs',
  orders: 'orders',
  leaveRequests: 'leaveRequests',
  weeklyReports: 'weeklyReports',
} as const

/** Locked food chat — same as whatsapp-food-feed FOOD_CHAT */
export const FOOD_CHAT_JID = '85297868213-1620171799@g.us'

export async function createMenuVisionJob(
  imageDataUrl: string,
  opts?: { contentType?: string },
): Promise<MenuVisionJobDoc> {
  const db = getDb()
  if (!db) throw new Error('Firebase not configured')
  const writeToken = requireWriteToken()
  const id = `mvj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const now = new Date().toISOString()
  const data: Omit<MenuVisionJobDoc, 'id'> = {
    status: 'pending',
    imageDataUrl,
    contentType: opts?.contentType ?? 'image/jpeg',
    byteLength: Math.round((imageDataUrl.length * 3) / 4),
    dishes: null,
    error: null,
    engine: null,
    source: 'menu-admin',
    notifyJid: FOOD_CHAT_JID,
    updatedAt: now,
    writeToken,
  }
  await setDoc(doc(db, COLLECTIONS.menuVisionJobs, id), data)
  return { id, ...data }
}

function mapMenuVisionJob(id: string, d: Omit<MenuVisionJobDoc, 'id'>): MenuVisionJobDoc {
  return {
    id,
    status: d.status as MenuVisionJobStatus,
    imageDataUrl: d.imageDataUrl ?? null,
    contentType: d.contentType ?? null,
    byteLength: d.byteLength ?? null,
    dishes: (d.dishes as MenuVisionDish[] | null) ?? null,
    error: d.error ?? null,
    engine: d.engine ?? null,
    source: d.source ?? 'menu-admin',
    notifyJid: d.notifyJid ?? null,
    updatedAt: d.updatedAt,
    writeToken: d.writeToken,
  }
}

export async function fetchMenuVisionJob(jobId: string): Promise<MenuVisionJobDoc | null> {
  const db = getDb()
  if (!db) return null
  const snap = await getDoc(doc(db, COLLECTIONS.menuVisionJobs, jobId))
  if (!snap.exists()) return null
  return mapMenuVisionJob(snap.id, snap.data() as Omit<MenuVisionJobDoc, 'id'>)
}

export function subscribeMenuVisionJob(
  jobId: string,
  onChange: (job: MenuVisionJobDoc | null) => void,
): Unsubscribe {
  const db = getDb()
  if (!db) {
    onChange(null)
    return () => undefined
  }
  return onSnapshot(doc(db, COLLECTIONS.menuVisionJobs, jobId), (snap) => {
    if (!snap.exists()) {
      onChange(null)
      return
    }
    onChange(mapMenuVisionJob(snap.id, snap.data() as Omit<MenuVisionJobDoc, 'id'>))
  })
}

export async function fetchPeople(db: Firestore): Promise<Person[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.people))
  return snap.docs.map((d) => {
    const data = d.data() as Partial<Person> & { name?: string }
    return {
      id: d.id,
      name: data.name ?? d.id,
      nameEn: data.nameEn,
      active: data.active ?? true,
      sortOrder: data.sortOrder ?? 0,
    }
  })
}

export async function fetchMenu(db: Firestore): Promise<MenuItem[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.menuItems))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MenuItem, 'id'>) }))
}

export async function fetchMenuPhotos(db: Firestore): Promise<MenuPhotoDoc[]> {
  const q = query(collection(db, COLLECTIONS.menuPhotos), orderBy('effectiveFrom', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MenuPhotoDoc, 'id'>) }))
}

export type SaveMenuPhotoInput = {
  id?: string
  effectiveFrom: string
  effectiveTo: string | null
  imageDataUrl: string
  note?: string | null
}

export async function saveMenuPhotoDoc(db: Firestore, input: SaveMenuPhotoInput): Promise<MenuPhotoDoc> {
  const writeToken = requireWriteToken()
  const id = input.id ?? `menu_${input.effectiveFrom}_${Date.now()}`
  const record: MenuPhotoDoc = {
    id,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo,
    imageDataUrl: input.imageDataUrl,
    imageUrl: null,
    contentType: 'image/jpeg',
    byteLength: Math.round((input.imageDataUrl.length * 3) / 4),
    note: input.note?.trim() || null,
    updatedAt: new Date().toISOString(),
    writeToken,
  }
  const { id: _id, ...data } = record
  await setDoc(doc(db, COLLECTIONS.menuPhotos, id), data, { merge: true })
  return record
}

export async function deleteMenuPhotoDoc(db: Firestore, id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.menuPhotos, id))
}

/**
 * When a new menu starts on `newStart`, set effectiveTo on open-ended earlier
 * photos to the day before — keeps those docs for historical matching.
 */
export async function closeOpenEndedMenuPhotosBefore(db: Firestore, newStart: string): Promise<number> {
  const until = dayBeforeIso(newStart)
  const photos = await fetchMenuPhotos(db)
  const writeToken = requireWriteToken()
  let n = 0
  for (const p of photos) {
    if (p.effectiveTo != null) continue
    if (p.effectiveFrom >= newStart) continue
    if (until < p.effectiveFrom) continue
    await setDoc(
      doc(db, COLLECTIONS.menuPhotos, p.id),
      {
        effectiveTo: until,
        updatedAt: new Date().toISOString(),
        writeToken,
      },
      { merge: true },
    )
    n++
  }
  return n
}

export async function saveMenuItemDoc(db: Firestore, item: MenuItem): Promise<MenuItem> {
  const writeToken = requireWriteToken()
  const id = item.id || `item_${Date.now()}`
  const nameEn = item.nameEn
  const payload = {
    nameZh: item.nameZh,
    nameEn: nameEn ?? null,
    category: item.category,
    priceHkd: item.priceHkd,
    aliases: item.aliases ?? [],
    active: item.active,
    updatedAt: new Date().toISOString(),
    writeToken,
  }
  await setDoc(doc(db, COLLECTIONS.menuItems, id), payload, { merge: true })
  return {
    id,
    nameZh: item.nameZh,
    nameEn,
    category: item.category,
    priceHkd: item.priceHkd,
    aliases: payload.aliases,
    active: item.active,
    updatedAt: payload.updatedAt,
    writeToken,
  }
}

export async function deleteMenuItemDoc(db: Firestore, id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.menuItems, id))
}

export function subscribeFoodOrdersMonth(
  db: Firestore,
  year: number,
  month: number,
  onData: (orders: FoodOrderDoc[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
  const q = query(
    collection(db, COLLECTIONS.orders),
    where('date', '>=', start),
    where('date', '<=', end),
    orderBy('date', 'asc'),
  )
  return onSnapshot(
    q,
    (snap) =>
      onData(
        snap.docs.map((d) => {
          const data = d.data() as Omit<FoodOrderDoc, 'id'>
          return { id: d.id, ...data }
        }),
      ),
    (err) => onError?.(err),
  )
}

export async function fetchLeaveForMonth(db: Firestore, month: string): Promise<LeaveRecordDoc[]> {
  const q = query(collection(db, COLLECTIONS.leaveRequests), where('month', '==', month))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LeaveRecordDoc, 'id'>) }))
}

export async function upsertFoodOrderDoc(
  db: Firestore,
  payload: UpsertOrderPayload,
  menu: MenuItem[],
): Promise<FoodOrderDoc> {
  const docData = buildOrderDoc(payload, menu)
  const { id, ...rest } = docData
  await setDoc(doc(db, COLLECTIONS.orders, id), rest, { merge: true })
  return docData
}

export async function createLeaveRecordDoc(db: Firestore, payload: CreateLeavePayload): Promise<LeaveRecordDoc> {
  const id = `${payload.person}_${payload.month}_${payload.dates[0] ?? 'na'}`
  const record: LeaveRecordDoc = {
    id,
    person: payload.person,
    month: payload.month,
    type: payload.type ?? 'annual',
    dates: payload.dates,
    halfDay: payload.halfDay ?? null,
    note: payload.note ?? null,
    sourceJid: null,
    sourceMessageId: null,
    updatedAt: new Date().toISOString(),
  }
  const { id: _id, ...data } = record
  await setDoc(doc(db, COLLECTIONS.leaveRequests, id), data, { merge: true })
  return record
}

export function tryGetDb(): Firestore | null {
  if (!firebaseConfigured) return null
  return getDb()
}
