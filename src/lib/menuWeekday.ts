/** Weekday for weekly lunch grid columns (Mon–Sat). Sunday menus are unused. */
export type MenuWeekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'

export const MENU_WEEKDAYS: MenuWeekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export const WEEKDAY_LABEL_ZH: Record<MenuWeekday, string> = {
  mon: '星期一',
  tue: '星期二',
  wed: '星期三',
  thu: '星期四',
  fri: '星期五',
  sat: '星期六',
}

export const WEEKDAY_LABEL_EN: Record<MenuWeekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
}

const ALIASES: Record<string, MenuWeekday> = {
  mon: 'mon',
  monday: 'mon',
  '星期一': 'mon',
  '周一': 'mon',
  '拜一': 'mon',
  tue: 'tue',
  tues: 'tue',
  tuesday: 'tue',
  '星期二': 'tue',
  '周二': 'tue',
  '拜二': 'tue',
  wed: 'wed',
  wednesday: 'wed',
  '星期三': 'wed',
  '周三': 'wed',
  '拜三': 'wed',
  thu: 'thu',
  thur: 'thu',
  thurs: 'thu',
  thursday: 'thu',
  '星期四': 'thu',
  '周四': 'thu',
  '拜四': 'thu',
  fri: 'fri',
  friday: 'fri',
  '星期五': 'fri',
  '周五': 'fri',
  '拜五': 'fri',
  sat: 'sat',
  saturday: 'sat',
  '星期六': 'sat',
  '周六': 'sat',
  '拜六': 'sat',
}

export function normalizeMenuWeekday(raw: unknown): MenuWeekday | null {
  if (raw == null) return null
  const s = String(raw).trim().toLowerCase()
  if (!s) return null
  if ((MENU_WEEKDAYS as string[]).includes(s)) return s as MenuWeekday
  const compact = s.replace(/\s+/g, '')
  return ALIASES[compact] ?? ALIASES[s] ?? null
}

/** HKT calendar date → menu column weekday (Sun → null). */
export function weekdayFromIsoDate(iso: string): MenuWeekday | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return null
  // Noon UTC avoids DST edge; HKT is UTC+8 fixed
  const dt = new Date(`${m[1]}-${m[2]}-${m[3]}T04:00:00Z`)
  if (Number.isNaN(dt.getTime())) return null
  const map: (MenuWeekday | null)[] = [null, 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  return map[dt.getUTCDay()] ?? null
}

export function weekdayLabel(day: MenuWeekday): string {
  return `${WEEKDAY_LABEL_EN[day]} · ${WEEKDAY_LABEL_ZH[day]}`
}
