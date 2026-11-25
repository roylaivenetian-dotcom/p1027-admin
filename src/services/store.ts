import { useEffect, useMemo, useState } from 'react'
import type { CreateLeavePayload, FoodOrder, LeaveRequest, MenuItem, Person, UpsertOrderPayload } from '../types'
import { SEED_MENU } from '../data/menu'
import { SEED_PEOPLE } from '../data/people'
import { MOCK_LEAVE, MOCK_ORDERS } from '../data/mockOrders'
import { priceOrder } from '../lib/pricing'
import { todayIsoHkt } from '../lib/dates'

const STORAGE_KEY = 'food-leave-app:v1'

interface AppState {
  people: Person[]
  menu: MenuItem[]
  orders: FoodOrder[]
  leave: LeaveRequest[]
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AppState
      return {
        people: parsed.people?.length ? parsed.people : SEED_PEOPLE,
        menu: parsed.menu?.length ? parsed.menu : SEED_MENU,
        orders: parsed.orders?.length ? parsed.orders : MOCK_ORDERS,
        leave: parsed.leave ?? MOCK_LEAVE,
      }
    }
  } catch {
    /* ignore */
  }
  return {
    people: SEED_PEOPLE,
    menu: SEED_MENU,
    orders: MOCK_ORDERS,
    leave: MOCK_LEAVE,
  }
}

function save(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

/** In-memory + localStorage store matching Firestore document shapes (bot-ready). */
let state: AppState = load()
const listeners = new Set<() => void>()

function emit() {
  save(state)
  listeners.forEach((l) => l())
}

export function getState(): AppState {
  return state
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAppStore(): AppState & {
  upsertOrder: (payload: UpsertOrderPayload) => FoodOrder
  createLeave: (payload: CreateLeavePayload) => LeaveRequest
  cancelLeave: (id: string) => void
  saveMenu: (menu: MenuItem[]) => void
  resetMockData: () => void
} {
  const [, setTick] = useState(0)
  useEffect(() => subscribe(() => setTick((t) => t + 1)), [])

  return useMemo(
    () => ({
      ...state,
      upsertOrder,
      createLeave,
      cancelLeave,
      saveMenu,
      resetMockData,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.people, state.menu, state.orders, state.leave],
  )
}

/** Idempotent upsert — same shape the Grok bot / Cloud Function will write. */
export function upsertOrder(payload: UpsertOrderPayload): FoodOrder {
  const priced = priceOrder(payload, state.menu)
  const id = `${payload.personId}_${payload.date}`
  const now = new Date().toISOString()
  const existing = state.orders.find((o) => o.id === id)
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
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  state = {
    ...state,
    orders: [...state.orders.filter((o) => o.id !== id), order],
  }
  emit()
  return order
}

export function createLeave(payload: CreateLeavePayload): LeaveRequest {
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
  state = {
    ...state,
    leave: [...state.leave.filter((l) => l.id !== id), leave],
  }
  emit()
  return leave
}

export function cancelLeave(id: string) {
  state = {
    ...state,
    leave: state.leave.map((l) =>
      l.id === id ? { ...l, status: 'cancelled', updatedAt: new Date().toISOString() } : l,
    ),
  }
  emit()
}

export function saveMenu(menu: MenuItem[]) {
  state = { ...state, menu }
  emit()
}

export function resetMockData() {
  state = {
    people: SEED_PEOPLE,
    menu: SEED_MENU,
    orders: MOCK_ORDERS,
    leave: MOCK_LEAVE,
  }
  emit()
}

/** Demo helper: simulate a WhatsApp bot push using the same upsert contract. */
export function mockBotPushSample(): FoodOrder {
  return upsertOrder({
    personId: 'alice',
    personName: 'Alice',
    date: todayIsoHkt(),
    mealNameZh: '豉椒雞球飯',
    addons: [{ kind: 'soup', nameZh: '湯', priceHkd: 0, onMenu: true }],
    sourceText: '[WhatsApp] Alice: 豉椒雞球飯 + 湯',
  })
}
