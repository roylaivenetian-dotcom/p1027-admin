import * as admin from 'firebase-admin'
import { onRequest } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret } from 'firebase-functions/params'

admin.initializeApp()
const db = admin.firestore()

const INGEST_API_KEY = defineSecret('INGEST_API_KEY')

const MEAL_PRICE = 50
const DRINK_PRICE = 5

type Addon = { kind: 'soup' | 'drink' | 'other'; nameZh: string; priceHkd?: number; onMenu?: boolean }

interface OrderBody {
  personId: string
  personName: string
  date: string
  mealNameZh: string
  mealNameEn?: string
  mealOnMenu?: boolean
  addons?: Addon[]
  remark?: string
  sourceText?: string
  forceStatus?: 'priced' | 'unpriced' | 'provisional'
  forceAmountHkd?: number
}

interface LeaveBody {
  personId: string
  personName: string
  monthKey: string
  startDate: string
  endDate: string
  leaveType: 'annual' | 'sick' | 'unpaid' | 'other'
  note?: string
  source?: string
}

function assertKey(req: { get: (h: string) => string | undefined }): void {
  const expected = INGEST_API_KEY.value()
  const got = req.get('x-ingest-key') || req.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!expected || got !== expected) {
    const err = new Error('Unauthorized')
    ;(err as Error & { status: number }).status = 401
    throw err
  }
}

async function loadMenu(): Promise<{ nameZh: string; category: string; priceHkd: number; aliases?: string[] }[]> {
  const snap = await db.collection('menuItems').where('active', '==', true).get()
  return snap.docs.map((d) => d.data() as { nameZh: string; category: string; priceHkd: number; aliases?: string[] })
}

function norm(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, '')
}

function matchMenu(
  menu: { nameZh: string; priceHkd: number; aliases?: string[] }[],
  name: string,
) {
  const key = norm(name)
  return menu.find(
    (m) => norm(m.nameZh) === key || m.aliases?.some((a) => norm(a) === key),
  )
}

function priceOrder(body: OrderBody, menu: Awaited<ReturnType<typeof loadMenu>>) {
  if (body.forceStatus === 'unpriced') {
    return {
      mealOnMenu: false,
      addons: body.addons ?? [],
      amountHkd: 0,
      status: 'unpriced' as const,
      remark: body.remark ?? '未計價',
    }
  }
  if (body.forceAmountHkd != null && body.forceStatus) {
    return {
      mealOnMenu: body.mealOnMenu ?? true,
      addons: body.addons ?? [],
      amountHkd: body.forceAmountHkd,
      status: body.forceStatus,
      remark: body.remark,
    }
  }

  const mealMatch = body.mealOnMenu === false ? undefined : matchMenu(menu, body.mealNameZh)
  const mealOnMenu = body.mealOnMenu ?? Boolean(mealMatch)
  const addons = (body.addons ?? []).map((a) => {
    if (a.kind === 'soup') return { ...a, priceHkd: 0, onMenu: a.onMenu ?? true }
    if (a.kind === 'drink') {
      const m = matchMenu(menu, a.nameZh)
      const onMenu = a.onMenu ?? Boolean(m)
      return { ...a, onMenu, priceHkd: onMenu ? m?.priceHkd ?? DRINK_PRICE : 0 }
    }
    const m = matchMenu(menu, a.nameZh)
    return { ...a, onMenu: a.onMenu ?? Boolean(m), priceHkd: m?.priceHkd ?? 0 }
  })

  const off = addons.some((a) => !a.onMenu && a.kind !== 'soup')
  if (!mealOnMenu || off) {
    return {
      mealOnMenu,
      addons,
      amountHkd: 0,
      status: 'unpriced' as const,
      remark: body.remark?.includes('未計價') ? body.remark : [body.remark, '未計價'].filter(Boolean).join(' · '),
    }
  }

  let amount = mealMatch?.priceHkd ?? MEAL_PRICE
  for (const a of addons) if (a.onMenu) amount += a.priceHkd ?? 0
  const provisional = Boolean(body.remark?.includes('暫') || body.forceStatus === 'provisional')
  return {
    mealOnMenu: true,
    addons,
    amountHkd: amount,
    status: provisional ? ('provisional' as const) : ('priced' as const),
    remark: body.remark,
  }
}

/**
 * Unified HTTP API for Grok / Agent SDK bot `whatsapp-food-feed`.
 * POST /api  with JSON { action: 'upsertOrder' | 'createLeave', ... }
 * Header: x-ingest-key: <INGEST_API_KEY>
 */
export const api = onRequest({ secrets: [INGEST_API_KEY], cors: true, region: 'asia-east2' }, async (req, res) => {
  if (req.method === 'GET') {
    res.json({ ok: true, service: 'food-leave-ingest', project: process.env.GCLOUD_PROJECT })
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }
  try {
    assertKey(req)
    const body = req.body as { action?: string } & Record<string, unknown>
    const action = body.action
    const now = new Date().toISOString()

    if (action === 'upsertOrder') {
      const orderBody = body as unknown as OrderBody
      if (!orderBody.personId || !orderBody.date || !orderBody.mealNameZh) {
        res.status(400).json({ error: 'personId, date, mealNameZh required' })
        return
      }
      const menu = await loadMenu()
      const priced = priceOrder(orderBody, menu)
      const id = `${orderBody.personId}_${orderBody.date}`
      const doc = {
        personId: orderBody.personId,
        personName: orderBody.personName,
        date: orderBody.date,
        mealNameZh: orderBody.mealNameZh,
        mealNameEn: orderBody.mealNameEn ?? null,
        ...priced,
        sourceText: orderBody.sourceText ?? null,
        source: 'whatsapp',
        updatedAt: now,
        createdAt: now,
      }
      await db.collection('orders').doc(id).set(doc, { merge: true })
      await db.collection('ingestEvents').add({
        kind: 'order',
        payloadSummary: `${id} ${orderBody.mealNameZh} $${priced.amountHkd}`,
        ok: true,
        createdAt: now,
      })
      res.json({ ok: true, id, order: { id, ...doc } })
      return
    }

    if (action === 'createLeave') {
      const leaveBody = body as unknown as LeaveBody
      if (!leaveBody.personId || !leaveBody.monthKey || !leaveBody.startDate || !leaveBody.endDate) {
        res.status(400).json({ error: 'personId, monthKey, startDate, endDate required' })
        return
      }
      const id = `${leaveBody.personId}_${leaveBody.monthKey}_${leaveBody.startDate}`
      const doc = {
        personId: leaveBody.personId,
        personName: leaveBody.personName,
        monthKey: leaveBody.monthKey,
        startDate: leaveBody.startDate,
        endDate: leaveBody.endDate,
        leaveType: leaveBody.leaveType ?? 'annual',
        note: leaveBody.note ?? null,
        status: 'submitted',
        source: leaveBody.source ?? 'whatsapp',
        createdAt: now,
        updatedAt: now,
      }
      await db.collection('leaveRequests').doc(id).set(doc, { merge: true })
      await db.collection('ingestEvents').add({
        kind: 'leave',
        payloadSummary: id,
        ok: true,
        createdAt: now,
      })
      res.json({ ok: true, id, leave: { id, ...doc } })
      return
    }

    res.status(400).json({ error: 'Unknown action. Use upsertOrder or createLeave' })
  } catch (e) {
    const err = e as Error & { status?: number }
    res.status(err.status ?? 500).json({ error: err.message })
  }
})

/**
 * Friday 17:00 Asia/Hong_Kong weekly food summary report.
 * Writes weeklyReports/{weekStart} with per-person totals.
 */
export const fridayFoodReport = onSchedule(
  {
    schedule: '0 17 * * 5',
    timeZone: 'Asia/Hong_Kong',
    region: 'asia-east2',
  },
  async () => {
    const now = new Date()
    // Compute current HKT Mon–Fri window containing "today"
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Hong_Kong',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    })
    const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]))
    const today = `${parts.year}-${parts.month}-${parts.day}`
    const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
    const dow = weekdayMap[parts.weekday] ?? 5
    const dayNum = Number(parts.day)
    const monthNum = Number(parts.month)
    const yearNum = Number(parts.year)
    const mondayOffset = dow === 0 ? -6 : 1 - dow
    const mondayDate = new Date(Date.UTC(yearNum, monthNum - 1, dayNum + mondayOffset))
    const fridayDate = new Date(Date.UTC(yearNum, monthNum - 1, dayNum + mondayOffset + 4))
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    const weekStart = iso(mondayDate)
    const weekEnd = iso(fridayDate)

    const snap = await db
      .collection('orders')
      .where('date', '>=', weekStart)
      .where('date', '<=', weekEnd)
      .get()

    const byPerson = new Map<string, { personName: string; totalHkd: number; provisional: boolean }>()
    for (const doc of snap.docs) {
      const o = doc.data()
      if (o.status === 'unpriced') continue
      const cur = byPerson.get(o.personId) ?? {
        personName: o.personName,
        totalHkd: 0,
        provisional: false,
      }
      cur.totalHkd += Number(o.amountHkd) || 0
      if (o.status === 'provisional') cur.provisional = true
      byPerson.set(o.personId, cur)
    }

    const personTotals = [...byPerson.entries()].map(([personId, v]) => ({ personId, ...v }))
    const grandTotalHkd = personTotals.reduce((s, p) => s + p.totalHkd, 0)
    const generatedAt = new Date().toISOString()
    await db.collection('weeklyReports').doc(weekStart).set({
      weekStart,
      weekEnd,
      generatedAt,
      timezone: 'Asia/Hong_Kong',
      personTotals,
      grandTotalHkd,
      trigger: 'friday_17h_hkt',
      asOfDate: today,
    })
    await db.collection('ingestEvents').add({
      kind: 'weekly_report',
      payloadSummary: `${weekStart} total $${grandTotalHkd}`,
      ok: true,
      createdAt: generatedAt,
    })
  },
)
