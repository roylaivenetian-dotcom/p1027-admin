/** YYYY-MM-DD helpers for menu effective ranges (HKT calendar dates as plain strings). */

export function dayBeforeIso(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d! - 1))
  return dt.toISOString().slice(0, 10)
}

export function formatMenuRange(from: string, to: string | null): string {
  return to ? `${from} → ${to}` : `${from} → open`
}
