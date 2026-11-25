/** Domain types aligned with whatsapp-food-feed Bot feed (see docs/food-leave-app.md). */

export type MenuCategory = 'meal' | 'soup' | 'drink' | 'other'

export interface Person {
  id: string
  /** Canonical display name used in orders.person */
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
  priceHkd: number
  aliases?: string[]
  active: boolean
  /** Present on Spark client writes */
  writeToken?: string
  updatedAt?: string
}

/**
 * Firestore `menuPhotos/{id}` — dated menu photos (primary fixed menu).
 * Spark stores JPEG as `imageDataUrl`; Blaze may also set HTTPS `imageUrl`.
 * Grok: pick the photo whose [effectiveFrom, effectiveTo] covers the order date.
 */
export interface MenuPhotoDoc {
  id: string
  /** Inclusive start date YYYY-MM-DD (HKT) when this menu becomes active */
  effectiveFrom: string
  /** Inclusive end date YYYY-MM-DD, or null = open-ended */
  effectiveTo: string | null
  /** JPEG data URL (Spark-compatible; primary image for Grok) */
  imageDataUrl: string | null
  /** HTTPS URL when Cloud Storage is available */
  imageUrl: string | null
  contentType: string | null
  byteLength: number | null
  note: string | null
  updatedAt: string
  writeToken?: string
}

/**
 * Firestore `orders/{orderId}` — written by whatsapp-food-feed.
 */
export interface FoodOrderDoc {
  id: string
  person: string
  date: string
  dish: string
  soup: boolean
  drink: string | null
  extras: string[]
  onMenu: boolean
  /** 50, 55, or 0 if off-menu */
  amount: number
  remark: string | null
  sourceJid: string | null
  sourceMessageId: string | null
  updatedAt: string
}

/**
 * Firestore `leaveRequests/{recordId}`
 * Display groups: annual → "Annual leave (AL)", sick → "Sick leave (SL)"
 */
export interface LeaveRecordDoc {
  id: string
  person: string
  /** YYYY-MM */
  month: string
  /** annual | sick | leave | unpaid | other — UI maps annual/leave → AL, sick → SL */
  type: string
  dates: string[]
  /** Half-day qualifier for single-date entries */
  halfDay?: 'AM' | 'PM' | null
  note: string | null
  sourceJid: string | null
  sourceMessageId: string | null
  updatedAt: string
}

export interface WeeklyReportDoc {
  id: string
  weekId: string
  weekStart: string
  weekEnd: string
  timezone: string
  personTotals: { person: string; total: number; orderCount: number; pricedCount: number }[]
  grandTotal: number
  orders: FoodOrderDoc[]
  generatedAt: string
  updatedAt: string
  note?: string
}

/** UI helpers derived from FoodOrderDoc */
export type OrderLineStatus = 'priced' | 'unpriced' | 'provisional'

export interface FoodOrderView {
  id: string
  personName: string
  date: string
  dish: string
  soup: boolean
  drink: string | null
  extras: string[]
  onMenu: boolean
  amount: number
  remark: string | null
  status: OrderLineStatus
}

export type LeaveType = 'annual' | 'sick' | 'unpaid' | 'leave' | 'other'

export interface LeaveView {
  id: string
  personName: string
  month: string
  type: string
  dates: string[]
  note: string | null
  status: 'submitted' | 'cancelled'
}

export interface CreateLeavePayload {
  person: string
  month: string
  type?: string
  dates: string[]
  halfDay?: 'AM' | 'PM' | null
  note?: string
}

export interface UpsertOrderPayload {
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
