import { useCallback, useEffect, useState } from 'react'
import type {
  CreateLeavePayload,
  FoodOrderDoc,
  LeaveRecordDoc,
  MenuItem,
  Person,
  UpsertOrderPayload,
} from '../types'
import { SEED_MENU } from '../data/menu'
import { SEED_PEOPLE } from '../data/people'
import { MOCK_FOOD_ORDERS, MOCK_LEAVE } from '../data/mockOrders'
import {
  cancelLeave as localCancelLeave,
  createLeave as localCreateLeave,
  saveMenu as localSaveMenu,
  upsertOrder as localUpsertOrder,
  getState,
  subscribe,
  resetMockData,
} from '../services/store'
import {
  fetchLeaveForMonth,
  fetchMenu,
  fetchPeople,
  subscribeFoodOrdersMonth,
  tryGetDb,
} from '../services/firestoreData'
import { firebaseConfigured, firebaseConfigSummary } from '../lib/firebase'
import { comingMonthKey, monthKey } from '../lib/dates'

export type DataSource = 'firestore' | 'mock'

export function useWorkplaceData(year: number, month: number) {
  const [people, setPeople] = useState<Person[]>(SEED_PEOPLE)
  const [menu, setMenu] = useState<MenuItem[]>(SEED_MENU)
  const [orders, setOrders] = useState<FoodOrderDoc[]>(MOCK_FOOD_ORDERS)
  const [leave, setLeave] = useState<LeaveRecordDoc[]>(MOCK_LEAVE)
  const [source, setSource] = useState<DataSource>('mock')
  const [status, setStatus] = useState('Loading…')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    return subscribe(() => {
      if (source === 'mock') {
        const s = getState()
        setPeople(s.people)
        setMenu(s.menu)
        setOrders(s.orders)
        setLeave(s.leave)
      }
    })
  }, [source])

  useEffect(() => {
    let cancelled = false
    let unsubOrders: (() => void) | undefined

    function applyMock(label: string, errMsg?: string) {
      const s = getState()
      setPeople(s.people)
      setMenu(s.menu)
      setOrders(s.orders)
      setLeave(s.leave)
      setSource('mock')
      setStatus(label)
      setError(errMsg ?? null)
    }

    async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        return await Promise.race([
          promise,
          new Promise<T>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Firestore timeout after ${ms}ms`)), ms)
          }),
        ])
      } finally {
        if (timer) clearTimeout(timer)
      }
    }

    async function load() {
      applyMock(`Mock data · connecting…`)

      const db = tryGetDb()
      if (!db || !firebaseConfigured) {
        if (!cancelled) applyMock(`Mock data · ${firebaseConfigSummary()}`)
        return
      }

      try {
        // Prefer orders presence; people/menu may be seeded later by the bot
        const probe = await withTimeout(
          Promise.all([fetchPeople(db), fetchMenu(db)]),
          4000,
        )
        if (cancelled) return
        const [p, m] = probe
        if (p.length) setPeople(p)
        if (m.length) setMenu(m)

        let gotLiveOrders = false
        unsubOrders = subscribeFoodOrdersMonth(
          db,
          year,
          month,
          (remoteOrders) => {
            if (cancelled) return
            if (remoteOrders.length > 0) {
              gotLiveOrders = true
              setOrders(remoteOrders)
              setSource('firestore')
              setStatus(`Live Firestore · ${firebaseConfigSummary()}`)
              setError(null)
            } else if (!gotLiveOrders) {
              // Empty month — keep mock for UX until bot writes
              const s = getState()
              setOrders(s.orders)
              setSource('mock')
              setStatus(`Firestore empty month · mock preview (${firebaseConfigSummary()})`)
            }
          },
          (err) => {
            console.warn(err)
            applyMock(`Firestore listen failed · mock fallback`, err.message)
          },
        )

        const mk = monthKey(year, month)
        const coming = comingMonthKey()
        try {
          const leaveRows = await withTimeout(
            Promise.all([fetchLeaveForMonth(db, mk), fetchLeaveForMonth(db, coming)]),
            4000,
          )
          if (!cancelled) {
            const merged = [...leaveRows[0], ...leaveRows[1]]
            if (merged.length) {
              const byId = new Map(merged.map((l) => [l.id, l]))
              setLeave([...byId.values()])
            }
          }
        } catch {
          /* leave optional */
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!cancelled) applyMock(`Mock fallback · ${firebaseConfigSummary()}`, msg)
      }
    }

    void load()
    return () => {
      cancelled = true
      unsubOrders?.()
    }
  }, [year, month])

  const upsertOrder = useCallback((payload: UpsertOrderPayload) => localUpsertOrder(payload), [])
  const createLeave = useCallback((payload: CreateLeavePayload) => localCreateLeave(payload), [])
  const cancelLeave = useCallback((id: string) => localCancelLeave(id), [])
  const saveMenu = useCallback((next: MenuItem[]) => localSaveMenu(next), [])

  return {
    people,
    menu,
    orders,
    leave,
    source,
    status,
    error,
    upsertOrder,
    createLeave,
    cancelLeave,
    saveMenu,
    resetMockData,
  }
}
