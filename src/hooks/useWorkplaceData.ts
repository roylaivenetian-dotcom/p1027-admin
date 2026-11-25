import { useCallback, useEffect, useState } from 'react'
import type {
  CreateLeavePayload,
  FoodOrderDoc,
  LeaveRecordDoc,
  MenuItem,
  MenuPhotoDoc,
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
  closeOpenEndedMenuPhotosBefore,
  deleteMenuItemDoc,
  deleteMenuPhotoDoc,
  fetchLeaveForMonth,
  fetchMenu,
  fetchMenuPhotos,
  fetchPeople,
  saveMenuItemDoc,
  saveMenuPhotoDoc,
  subscribeFoodOrdersMonth,
  tryGetDb,
  type SaveMenuPhotoInput,
} from '../services/firestoreData'
import { firebaseConfigured, firebaseConfigSummary } from '../lib/firebase'
import { comingMonthKey, monthKey } from '../lib/dates'

export type DataSource = 'firestore' | 'mock'

export function useWorkplaceData(year: number, month: number) {
  const [people, setPeople] = useState<Person[]>(SEED_PEOPLE)
  const [menu, setMenu] = useState<MenuItem[]>(SEED_MENU)
  const [menuPhotos, setMenuPhotos] = useState<MenuPhotoDoc[]>([])
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
          Promise.all([fetchPeople(db), fetchMenu(db), fetchMenuPhotos(db)]),
          12000,
        )
        if (cancelled) return
        const [p, m, photos] = probe
        if (p.length) setPeople(p)
        if (m.length) setMenu(m)
        setMenuPhotos(photos)
        if (photos.length) {
          setSource('firestore')
          setStatus(`Live Firestore · ${firebaseConfigSummary()}`)
        }

        let gotLiveOrders = false
        let gotLiveLeave = false
        let leaveResolved = false
        let remoteLeave: LeaveRecordDoc[] = []

        const markLive = (kind: 'orders' | 'leave') => {
          setSource('firestore')
          setStatus(`Live Firestore · ${firebaseConfigSummary()}`)
          setError(null)
          if (kind === 'orders') gotLiveOrders = true
          if (kind === 'leave') gotLiveLeave = true
        }

        const mk = monthKey(year, month)
        const coming = comingMonthKey()

        // Leave + orders in parallel so Live never pairs with leftover mock leave
        const leavePromise = withTimeout(
          Promise.all([fetchLeaveForMonth(db, mk), fetchLeaveForMonth(db, coming)]),
          12000,
        )
          .then((leaveRows) => {
            if (cancelled) return
            const byId = new Map([...leaveRows[0], ...leaveRows[1]].map((l) => [l.id, l]))
            remoteLeave = [...byId.values()]
            leaveResolved = true
            if (remoteLeave.length) {
              setLeave(remoteLeave)
              markLive('leave')
            } else if (gotLiveOrders) {
              setLeave([])
            }
          })
          .catch((err) => {
            console.warn('leave fetch', err)
            leaveResolved = true
          })

        unsubOrders = subscribeFoodOrdersMonth(
          db,
          year,
          month,
          (remoteOrders) => {
            if (cancelled) return
            if (remoteOrders.length > 0) {
              setOrders(remoteOrders)
              markLive('orders')
              // Drop mock leave as soon as orders prove Firestore is live
              if (leaveResolved) setLeave(remoteLeave)
              else setLeave([])
            } else if (!gotLiveOrders) {
              const s = getState()
              setOrders(s.orders)
              if (!gotLiveLeave) {
                setSource('mock')
                setStatus(`Firestore empty month · mock preview (${firebaseConfigSummary()})`)
              } else {
                setStatus(`Live Firestore (leave) · orders empty · ${firebaseConfigSummary()}`)
              }
            }
          },
          (err) => {
            console.warn(err)
            applyMock(`Firestore listen failed · mock fallback`, err.message)
          },
        )

        await leavePromise
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

  const refreshMenuData = useCallback(async () => {
    const db = tryGetDb()
    if (!db) return
    const [m, photos] = await Promise.all([fetchMenu(db), fetchMenuPhotos(db)])
    setMenu(m.length ? m : SEED_MENU)
    setMenuPhotos(photos)
  }, [])

  const savePhoto = useCallback(async (input: SaveMenuPhotoInput) => {
    const db = tryGetDb()
    if (!db) throw new Error('Firestore not configured')
    await saveMenuPhotoDoc(db, input)
  }, [])

  const closeOpenEndedBefore = useCallback(async (newStart: string) => {
    const db = tryGetDb()
    if (!db) throw new Error('Firestore not configured')
    await closeOpenEndedMenuPhotosBefore(db, newStart)
  }, [])

  const deletePhoto = useCallback(async (id: string) => {
    const db = tryGetDb()
    if (!db) throw new Error('Firestore not configured')
    await deleteMenuPhotoDoc(db, id)
  }, [])

  const saveItem = useCallback(async (item: MenuItem) => {
    const db = tryGetDb()
    if (!db) throw new Error('Firestore not configured')
    await saveMenuItemDoc(db, item)
  }, [])

  const deleteItem = useCallback(async (id: string) => {
    const db = tryGetDb()
    if (!db) throw new Error('Firestore not configured')
    await deleteMenuItemDoc(db, id)
  }, [])

  return {
    people,
    menu,
    menuPhotos,
    orders,
    leave,
    source,
    status,
    error,
    upsertOrder,
    createLeave,
    cancelLeave,
    saveMenu,
    refreshMenuData,
    savePhoto,
    closeOpenEndedBefore,
    deletePhoto,
    saveItem,
    deleteItem,
    resetMockData,
  }
}
