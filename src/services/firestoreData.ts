import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore'
import type { CreateLeavePayload, FoodOrderDoc, LeaveRecordDoc, MenuItem, Person, UpsertOrderPayload } from '../types'
import { buildOrderDoc } from '../lib/pricing'
import { getDb, firebaseConfigured } from '../lib/firebase'

/** Collection names — must match shared Bot feed contract. */
export const COLLECTIONS = {
  people: 'people',
  menuItems: 'menuItems',
  orders: 'orders',
  leaveRequests: 'leaveRequests',
  weeklyReports: 'weeklyReports',
} as const

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
    type: payload.type ?? 'leave',
    dates: payload.dates,
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
