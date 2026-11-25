/** Shared domain types — also the bot ingest contract shapes. */

export type MenuCategory = 'meal' | 'soup' | 'drink' | 'other'

export interface Person {
  id: string
  name: string
  nameEn?: string
  active: boolean
  sortOrder: number
}

export interface MenuItem {
  id: string
  nameZh: string
  nameEn?: string
  category: MenuCategory
  /** Base price contribution; soup is 0, meal typically 50, drink typically 5 */
  priceHkd: number
  aliases?: string[]
  active: boolean
}

export type OrderLineStatus = 'priced' | 'unpriced' | 'provisional'

export interface OrderAddon {
  kind: 'soup' | 'drink' | 'other'
  nameZh: string
  priceHkd: number
  onMenu: boolean
}

/**
 * One person's lunch order for one calendar day.
 * Document id recommendation: `{personId}_{yyyy-MM-dd}` for idempotent upserts from the bot.
 */
export interface FoodOrder {
  id: string
  personId: string
  personName: string
  /** ISO date yyyy-MM-dd in Asia/Hong_Kong calendar */
  date: string
  mealNameZh: string
  mealNameEn?: string
  mealOnMenu: boolean
  addons: OrderAddon[]
  /** Computed priced amount in HKD; 0 when unpriced */
  amountHkd: number
  status: OrderLineStatus
  /** Free-text remark (off-menu notes, substitutions, 未計價 details) */
  remark?: string
  /** Raw WhatsApp / bot source snippet */
  sourceText?: string
  source?: 'whatsapp' | 'manual' | 'mock'
  updatedAt: string
  createdAt: string
}

export type LeaveType = 'annual' | 'sick' | 'unpaid' | 'other'

/**
 * Self-serve leave record for a coming month window.
 * Document id: auto or `{personId}_{monthKey}_{startDate}`.
 */
export interface LeaveRequest {
  id: string
  personId: string
  personName: string
  /** Target month yyyy-MM (the month leave applies to / was submitted for) */
  monthKey: string
  startDate: string
  endDate: string
  leaveType: LeaveType
  note?: string
  /** Simple status until approval workflow is defined */
  status: 'submitted' | 'cancelled'
  source?: 'app' | 'whatsapp' | 'mock'
  createdAt: string
  updatedAt: string
}

export interface IngestEvent {
  id: string
  kind: 'order' | 'leave' | 'weekly_report'
  payloadSummary: string
  ok: boolean
  error?: string
  createdAt: string
}

export interface WeeklyReport {
  id: string
  /** Week start Monday yyyy-MM-dd */
  weekStart: string
  weekEnd: string
  generatedAt: string
  timezone: 'Asia/Hong_Kong'
  personTotals: { personId: string; personName: string; totalHkd: number; provisional: boolean }[]
  grandTotalHkd: number
}

/** Bot write payloads (without server-managed ids/timestamps) */
export interface UpsertOrderPayload {
  personId: string
  personName: string
  date: string
  mealNameZh: string
  mealNameEn?: string
  mealOnMenu?: boolean
  addons?: OrderAddon[]
  remark?: string
  sourceText?: string
  /** If omitted, server prices from menu */
  forceStatus?: OrderLineStatus
  forceAmountHkd?: number
}

export interface CreateLeavePayload {
  personId: string
  personName: string
  monthKey: string
  startDate: string
  endDate: string
  leaveType: LeaveType
  note?: string
  source?: 'app' | 'whatsapp' | 'mock'
}

export interface WeekBucket {
  weekStart: Date
  weekEnd: Date
  label: string
  orders: FoodOrder[]
}
