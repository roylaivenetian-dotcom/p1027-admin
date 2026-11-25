import { useEffect, useMemo, useState } from 'react'
import type { CreateLeavePayload, FoodOrderDoc, LeaveRecordDoc, MenuItem, Person, UpsertOrderPayload } from '../types'
import { SEED_MENU } from '../data/menu'
import { SEED_PEOPLE } from '../data/people'
import { MOCK_FOOD_ORDERS, MOCK_LEAVE } from '../data/mockOrders'
import { buildOrderDoc } from '../lib/pricing'
import { todayIsoHkt } from '../lib/dates'

const STORAGE_KEY = 'food-leave-app:v3'

interface AppState {
  people: Person[]
  menu: MenuItem[]
  orders: FoodOrderDoc[]
  leave: LeaveRecordDoc[]
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as AppState
      return {
        people: parsed.people?.length ? parsed.people : SEED_PEOPLE,
        menu: parsed.menu?.length ? parsed.menu : SEED_MENU,
        orders: parsed.orders?.length ? parsed.orders : MOCK_FOOD_ORDERS,
        leave: parsed.leave ?? MOCK_LEAVE,
      }
    }
  } catch {
    /* ignore */
  }
  return {
    people: SEED_PEOPLE,
    menu: SEED_MENU,
    orders: MOCK_FOOD_ORDERS,
    leave: MOCK_LEAVE,
  }
}

function save(state: AppState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

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

export function useAppStore() {
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

export function upsertOrder(payload: UpsertOrderPayload): FoodOrderDoc {
  const order = buildOrderDoc(payload, state.menu)
  state = {
    ...state,
    orders: [...state.orders.filter((o) => o.id !== order.id), order],
  }
  emit()
  return order
}

export function createLeave(payload: CreateLeavePayload): LeaveRecordDoc {
  const id = `${payload.person}_${payload.month}_${payload.dates[0] ?? 'na'}`
  const leave: LeaveRecordDoc = {
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
    leave: state.leave.filter((l) => l.id !== id),
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
    orders: MOCK_FOOD_ORDERS,
    leave: MOCK_LEAVE,
  }
  emit()
}

export function mockBotPushSample(): FoodOrderDoc {
  return upsertOrder({
    person: 'Ken',
    date: todayIsoHkt(),
    dish: '豉椒雞球飯',
    soup: true,
    drink: null,
    sourceMessageId: `mock-${Date.now()}`,
  })
}
