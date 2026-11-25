import * as admin from 'firebase-admin'
import { onRequest } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineString } from 'firebase-functions/params'

admin.initializeApp()
const db = admin.firestore()

/**
 * Ingest shared secret (no Secret Manager / Blaze required).
 * Set via functions/.env.sick-meal (gitignored) or FIREBASE_INGEST_KEY at deploy.
 */
const INGEST_API_KEY = defineString('INGEST_API_KEY')

/** Prefer us-central1 so Firebase Hosting rewrites can resolve the function. */
const REGION = 'us-central1'

const MEAL_PRICE = 50
const DRINK_PRICE = 5
const FOOD_CHAT_JID = '85297868213-1620171799@g.us'

interface OrderBody {
  person: string
  date: string
  dish: string
  soup?: boolean
  drink?: string | null
  extras?: string[]
  onMenu?: boolean
  amount?: number
  remark?: string | null
  sourceJid?: string | null
  sourceMessageId?: string | null
}

interface LeaveBody {
  person: string
  month: string
  type?: string
  dates: string[]
  note?: string | null
  sourceJid?: string | null
  sourceMessageId?: string | null
}

interface WeeklyReportBody {
  weekId?: string
  weekStart: string
  weekEnd: string
  timezone?: string
  personTotals: Array<{
    person: string
    total: number
    orderCount: number
    pricedCount: number
  }>
  grandTotal: number
  orders?: unknown[]
  note?: string
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

function price(body: OrderBody): { onMenu: boolean; amount: number; remark: string | null } {
  if (body.onMenu === false) {
    return { onMenu: false, amount: 0, remark: body.remark ?? '未計價' }
  }
  if (body.amount != null && body.onMenu != null) {
    return { onMenu: body.onMenu, amount: body.amount, remark: body.remark ?? null }
  }
  let amount = MEAL_PRICE
  if (body.drink) amount += DRINK_PRICE
  return { onMenu: true, amount, remark: body.remark ?? null }
}

/**
 * HTTP ingest for P1027 Admin / whatsapp-food-feed.
 * Uses Functions default credentials (no downloaded SA key). Auth via x-ingest-key.
 *
 * POST actions: upsertOrder | createLeave | upsertWeeklyReport
 * Also accepts batch: { action: 'upsertOrders', orders: [...] }
 */
export const api = onRequest(
  {
    cors: true,
    region: REGION,
    invoker: 'public',
  },
  async (req, res) => {
    if (req.method === 'GET') {
      res.json({
        ok: true,
        service: 'p1027-admin-ingest',
        brand: 'P1027 Admin',
        project: process.env.GCLOUD_PROJECT || 'sick-meal',
        collections: ['orders', 'leaveRequests', 'weeklyReports'],
        foodChatJid: FOOD_CHAT_JID,
        actions: ['upsertOrder', 'upsertOrders', 'createLeave', 'upsertWeeklyReport'],
      })
      return
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'POST only' })
      return
    }
    try {
      assertKey(req)
      const body = req.body as { action?: string } & Record<string, unknown>
      const now = new Date().toISOString()
      const action = body.action

      if (action === 'upsertOrders' && Array.isArray(body.orders)) {
        const results = []
        for (const item of body.orders as OrderBody[]) {
          results.push(await writeOrder(item, now))
        }
        res.json({ ok: true, count: results.length, results })
        return
      }

      if (action === 'upsertOrder') {
        const result = await writeOrder(body as unknown as OrderBody, now)
        res.json({ ok: true, ...result })
        return
      }

      if (action === 'createLeave') {
        const l = body as unknown as LeaveBody
        if (!l.person || !l.month || !l.dates?.length) {
          res.status(400).json({ error: 'person, month, dates required' })
          return
        }
        const id = `${l.person}_${l.month}_${l.dates[0]}`
        const doc = {
          person: l.person,
          month: l.month,
          type: l.type ?? 'leave',
          dates: l.dates,
          note: l.note ?? null,
          sourceJid: l.sourceJid ?? FOOD_CHAT_JID,
          sourceMessageId: l.sourceMessageId ?? null,
          updatedAt: now,
        }
        await db.collection('leaveRequests').doc(id).set(doc, { merge: true })
        res.json({ ok: true, id, leave: { id, ...doc } })
        return
      }

      if (action === 'upsertWeeklyReport') {
        const r = body as unknown as WeeklyReportBody
        if (!r.weekStart || !r.weekEnd || !Array.isArray(r.personTotals)) {
          res.status(400).json({ error: 'weekStart, weekEnd, personTotals required' })
          return
        }
        const weekId = r.weekId || `${r.weekStart}_${r.weekEnd}`
        const doc = {
          weekId,
          weekStart: r.weekStart,
          weekEnd: r.weekEnd,
          timezone: r.timezone || 'Asia/Hong_Kong',
          personTotals: r.personTotals,
          grandTotal: r.grandTotal ?? r.personTotals.reduce((s, p) => s + (p.total || 0), 0),
          orders: r.orders ?? [],
          note: r.note ?? null,
          generatedAt: now,
          updatedAt: now,
        }
        await db.collection('weeklyReports').doc(weekId).set(doc, { merge: true })
        res.json({ ok: true, id: weekId, report: doc })
        return
      }

      res.status(400).json({
        error: 'Unknown action. Use upsertOrder, upsertOrders, createLeave, or upsertWeeklyReport',
      })
    } catch (e) {
      const err = e as Error & { status?: number }
      res.status(err.status ?? 500).json({ error: err.message })
    }
  },
)

async function writeOrder(o: OrderBody, now: string) {
  if (!o.person || !o.date || !o.dish) {
    throw Object.assign(new Error('person, date, dish required'), { status: 400 })
  }
  const priced = price(o)
  const id = o.sourceMessageId ? `${o.person}_${o.date}_${o.sourceMessageId}` : `${o.person}_${o.date}`
  const doc = {
    person: o.person,
    date: o.date,
    dish: o.dish,
    soup: Boolean(o.soup),
    drink: o.drink ?? null,
    extras: o.extras ?? [],
    onMenu: priced.onMenu,
    amount: priced.amount,
    remark: priced.remark,
    sourceJid: o.sourceJid ?? FOOD_CHAT_JID,
    sourceMessageId: o.sourceMessageId ?? null,
    updatedAt: now,
  }
  await db.collection('orders').doc(id).set(doc, { merge: true })
  return { id, order: { id, ...doc } }
}

/** Friday 17:00 HKT weekly rollup into weeklyReports. */
export const fridayFoodReport = onSchedule(
  {
    schedule: '0 17 * * 5',
    timeZone: 'Asia/Hong_Kong',
    region: REGION,
  },
  async () => {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Hong_Kong',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    })
    const now = new Date()
    const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]))
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
    const weekId = `${weekStart}_${weekEnd}`

    const snap = await db
      .collection('orders')
      .where('date', '>=', weekStart)
      .where('date', '<=', weekEnd)
      .get()

    const byPerson = new Map<string, { total: number; orderCount: number; pricedCount: number }>()
    const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    for (const o of orders) {
      const data = o as { person?: string; onMenu?: boolean; amount?: number }
      const person = String(data.person ?? '')
      const cur = byPerson.get(person) ?? { total: 0, orderCount: 0, pricedCount: 0 }
      cur.orderCount++
      if (data.onMenu && Number(data.amount) > 0) {
        cur.total += Number(data.amount)
        cur.pricedCount++
      }
      byPerson.set(person, cur)
    }

    const personTotals = [...byPerson.entries()].map(([person, v]) => ({ person, ...v }))
    const grandTotal = personTotals.reduce((s, p) => s + p.total, 0)
    const generatedAt = new Date().toISOString()
    await db.collection('weeklyReports').doc(weekId).set({
      weekId,
      weekStart,
      weekEnd,
      timezone: 'Asia/Hong_Kong',
      personTotals,
      grandTotal,
      orders,
      generatedAt,
      updatedAt: generatedAt,
      note: 'friday_17h_hkt_cloud_function',
    })
  },
)
