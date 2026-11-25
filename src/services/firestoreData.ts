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
import type { CreateLeavePayload, FoodOrder, LeaveRequest, MenuItem, Person, UpsertOrderPayload } from '../types'
import { priceOrder } from '../lib/pricing'
import { getDb, firebaseConfigured } from '../lib/firebase'

/** Collection names — shared contract with whatsapp-food-feed bot. */
export const COLLECTIONS = {
  people: 'people',
  menuItems: 'menuItems',
  orders: 'orders',
  leaveRequests: 'leaveRequests',
  ingestEvents: 'ingestEvents',
  weeklyReports: 'weeklyReports',
} as const

export function orderDocId(personId: string, date: string): string {
  return `${personId}_${date}`
}

export async function fetchPeople(db: Firestore): Promise<Person[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.people))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Person, 'id'>) }))
}

export async function fetchMenu(db: Firestore): Promise<MenuItem[]> {
  const snap = await getDocs(collection(db, COLLECTIONS.menuItems))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MenuItem, 'id'>) }))
}

export async function fetchOrdersForMonth(db: Firestore, year: number, month: number): Promise<FoodOrder[]> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const end = `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
  const q = query(
    collection(db, COLLECTIONS.orders),
    where('date', '>=', start),
    where('date', '<=', end),
    orderBy('date', 'asc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FoodOrder, 'id'>) }))
}

export async function fetchLeaveForMonth(db: Firestore, monthKey: string): Promise<LeaveRequest[]> {
  const q = query(collection(db, COLLECTIONS.leaveRequests), where('monthKey', '==', monthKey))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LeaveRequest, 'id'>) }))
}

export function subscribeOrdersMonth(
  db: Firestore,
  year: number,
  month: number,
  onData: (orders: FoodOrder[]) => void,
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
    (snap) => onData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FoodOrder, 'id'>) }))),
    (err) => onError?.(err),
  )
}

/** Client-side upsert used when rules allow; bots should use Admin SDK / ingest API. */
export async function upsertOrderDoc(
  db: Firestore,
  payload: UpsertOrderPayload,
  menu: MenuItem[],
): Promise<FoodOrder> {
  const priced = priceOrder(payload, menu)
  const id = orderDocId(payload.personId, payload.date)
  const now = new Date().toISOString()
  const ref = doc(db, COLLECTIONS.orders, id)
  const order: FoodOrder = {
    id,
    personId: payload.personId,
    personName: payload.personName,
    date: payload.date,
    mealNameZh: payload.mealNameZh,
    mealNameEn: payload.mealNameEn,
    ...priced,
    sourceText: payload.sourceText,
    source: payload.sourceText ? 'whatsapp' : 'manual',
    createdAt: now,
    updatedAt: now,
  }
  const { id: _id, ...data } = order
  await setDoc(ref, data, { merge: true })
  return order
}

export async function createLeaveDoc(db: Firestore, payload: CreateLeavePayload): Promise<LeaveRequest> {
  const now = new Date().toISOString()
  const id = `${payload.personId}_${payload.monthKey}_${payload.startDate}`
  const leave: LeaveRequest = {
    id,
    personId: payload.personId,
    personName: payload.personName,
    monthKey: payload.monthKey,
    startDate: payload.startDate,
    endDate: payload.endDate,
    leaveType: payload.leaveType,
    note: payload.note,
    status: 'submitted',
    source: payload.source ?? 'app',
    createdAt: now,
    updatedAt: now,
  }
  const { id: _id, ...data } = leave
  await setDoc(doc(db, COLLECTIONS.leaveRequests, id), data, { merge: true })
  return leave
}

export function tryGetDb(): Firestore | null {
  if (!firebaseConfigured) return null
  return getDb()
}
