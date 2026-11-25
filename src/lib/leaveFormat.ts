import type { LeaveRecordDoc } from '../types'

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Display columns: Annual (AL), Sick (SL), Special (CL / compensatory / unpaid / other). */
export type LeaveBucket = 'AL' | 'SL' | 'Special'

/**
 * Map leaveRequests.type → summary column.
 * Canonical: `annual` | `sick` | `special`.
 * Special aliases: `cl`, `compensatory`, `unpaid`, `other`, 補假 / 特假.
 * AL also accepts `leave` / 年假 / 請假; SL accepts `sl` / 病假.
 */
export function leaveBucket(type: string): LeaveBucket {
  const t = type.trim().toLowerCase()
  if (t === 'sick' || t === 'sl' || t === '病假') return 'SL'
  if (t === 'annual' || t === 'al' || t === 'leave' || t === '年假' || t === '請假') return 'AL'
  // special | cl | compensatory | unpaid | other | …
  return 'Special'
}

function dayNum(iso: string): number {
  return Number(iso.slice(8, 10))
}

function monthAbbr(iso: string): string {
  return MONTH_SHORT[Number(iso.slice(5, 7)) - 1] ?? iso.slice(5, 7)
}

function addOneUtcDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d! + 1))
  return dt.toISOString().slice(0, 10)
}

/** Collapse sorted ISO dates into contiguous ranges. */
export function collapseDateRanges(dates: string[]): { start: string; end: string }[] {
  const sorted = [...new Set(dates)].sort()
  if (!sorted.length) return []
  const ranges: { start: string; end: string }[] = []
  let start = sorted[0]!
  let prev = sorted[0]!
  for (let i = 1; i < sorted.length; i++) {
    const cur = sorted[i]!
    if (cur === addOneUtcDay(prev)) {
      prev = cur
      continue
    }
    ranges.push({ start, end: prev })
    start = cur
    prev = cur
  }
  ranges.push({ start, end: prev })
  return ranges
}

function normalizeHalfDay(halfDay: unknown): 'AM' | 'PM' | null {
  if (halfDay === 'AM' || halfDay === 'PM') return halfDay
  // Bot/feed sometimes sends boolean; treat true as PM (common WhatsApp shorthand)
  if (halfDay === true) return 'PM'
  return null
}

function formatRangeLabel(start: string, end: string, halfDay?: 'AM' | 'PM' | null): string {
  const m = monthAbbr(start)
  if (start === end) {
    const half = halfDay ? `, ${halfDay}` : ''
    return `${dayNum(start)} ${m}${half}`
  }
  if (start.slice(0, 7) === end.slice(0, 7)) {
    return `${dayNum(start)}–${dayNum(end)} ${m}`
  }
  return `${dayNum(start)} ${m}–${dayNum(end)} ${monthAbbr(end)}`
}

/**
 * WhatsApp-style leave line, e.g.:
 * `3 Nov — Daniel`
 * `4 Nov, PM — So kaiyin`
 * `2–4 Nov — Name`
 * `6 Nov — Yin (note)`
 */
export function formatLeaveBullet(record: LeaveRecordDoc): string {
  const ranges = collapseDateRanges(record.dates)
  const half = record.dates.length <= 1 ? normalizeHalfDay(record.halfDay) : null
  const datePart =
    ranges.length === 0
      ? '—'
      : ranges.map((r) => formatRangeLabel(r.start, r.end, ranges.length === 1 ? half : null)).join(', ')
  const note = record.note?.trim() ? ` (${record.note.trim()})` : ''
  return `${datePart} — ${record.person}${note}`
}

export function sortLeaveRecords(a: LeaveRecordDoc, b: LeaveRecordDoc): number {
  const a0 = a.dates[0] ?? ''
  const b0 = b.dates[0] ?? ''
  return a0.localeCompare(b0) || a.person.localeCompare(b.person)
}
