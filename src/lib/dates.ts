/** Calendar helpers in Asia/Hong_Kong (HKT, UTC+8). No DST. */

const HKT = 'Asia/Hong_Kong'

export function hktParts(d: Date = new Date()): {
  year: number
  month: number
  day: number
  weekday: number
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: HKT,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]))
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: weekdayMap[parts.weekday] ?? 0,
  }
}

export function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function parseIso(iso: string): { year: number; month: number; day: number } {
  const [y, m, d] = iso.split('-').map(Number)
  return { year: y, month: m, day: d }
}

export function todayIsoHkt(): string {
  const p = hktParts()
  return toIsoDate(p.year, p.month, p.day)
}

export function isFirstOfMonthHkt(d: Date = new Date()): boolean {
  return hktParts(d).day === 1
}

/** Mon–Fri working weeks that intersect the given calendar month. */
export function workingWeeksInMonth(year: number, month: number): { start: string; end: string; label: string }[] {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const weeks: { start: string; end: string; label: string }[] = []
  let cursor = 1

  while (cursor <= daysInMonth) {
    const dow = new Date(Date.UTC(year, month - 1, cursor)).getUTCDay() // 0=Sun
    if (dow === 0 || dow === 6) {
      cursor++
      continue
    }
    // Find Monday of this week (or month start if later)
    const mondayOffset = dow === 0 ? -6 : 1 - dow
    let startDay = cursor + mondayOffset
    if (startDay < 1) startDay = 1
    // Skip if start is weekend somehow
    while (startDay <= daysInMonth) {
      const sd = new Date(Date.UTC(year, month - 1, startDay)).getUTCDay()
      if (sd !== 0 && sd !== 6) break
      startDay++
    }
    if (startDay > daysInMonth) break

    let endDay = startDay
    while (endDay < daysInMonth) {
      const next = endDay + 1
      const nd = new Date(Date.UTC(year, month - 1, next)).getUTCDay()
      if (nd === 0 || nd === 6) break
      // Stay within same Mon–Fri block
      const startDow = new Date(Date.UTC(year, month - 1, startDay)).getUTCDay()
      if (nd < startDow) break
      endDay = next
    }
    // Cap Friday
    const startDow = new Date(Date.UTC(year, month - 1, startDay)).getUTCDay()
    const maxEnd = startDay + (5 - startDow)
    endDay = Math.min(endDay, maxEnd, daysInMonth)

    const monthShort = new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', {
      month: 'short',
      timeZone: 'UTC',
    })
    weeks.push({
      start: toIsoDate(year, month, startDay),
      end: toIsoDate(year, month, endDay),
      label: `${monthShort} ${startDay}-${endDay}`,
    })
    cursor = endDay + 1
  }

  // Deduplicate overlapping
  const seen = new Set<string>()
  return weeks.filter((w) => {
    if (seen.has(w.start)) return false
    seen.add(w.start)
    return true
  })
}

export function inRange(iso: string, start: string, end: string): boolean {
  return iso >= start && iso <= end
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function comingMonthKey(from: Date = new Date()): string {
  const p = hktParts(from)
  let y = p.year
  let m = p.month + 1
  if (m > 12) {
    m = 1
    y++
  }
  return monthKey(y, m)
}

export function formatDisplayDate(iso: string): string {
  const { day, month } = parseIso(iso)
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`
}
