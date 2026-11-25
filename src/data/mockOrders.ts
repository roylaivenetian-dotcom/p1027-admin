import type { FoodOrder, LeaveRequest } from '../types'
import { priceOrder } from '../lib/pricing'
import { SEED_MENU } from './menu'

function build(
  partial: {
    personId: string
    personName: string
    date: string
    mealNameZh: string
    addons?: { kind: 'soup' | 'drink' | 'other'; nameZh: string; priceHkd?: number; onMenu?: boolean }[]
    remark?: string
    mealOnMenu?: boolean
    forceStatus?: 'priced' | 'unpriced' | 'provisional'
    forceAmountHkd?: number
  },
): FoodOrder {
  const priced = priceOrder(
    {
      personId: partial.personId,
      personName: partial.personName,
      date: partial.date,
      mealNameZh: partial.mealNameZh,
      mealOnMenu: partial.mealOnMenu,
      addons: (partial.addons ?? []).map((a) => ({
        kind: a.kind,
        nameZh: a.nameZh,
        priceHkd: a.priceHkd ?? 0,
        onMenu: a.onMenu ?? true,
      })),
      remark: partial.remark,
      forceStatus: partial.forceStatus,
      forceAmountHkd: partial.forceAmountHkd,
    },
    SEED_MENU,
  )
  const id = `${partial.personId}_${partial.date}`
  const now = '2026-11-20T09:00:00+08:00'
  return {
    id,
    personId: partial.personId,
    personName: partial.personName,
    date: partial.date,
    mealNameZh: partial.mealNameZh,
    ...priced,
    source: 'mock',
    sourceText: `[WhatsApp mock] ${partial.personName}: ${partial.mealNameZh}`,
    createdAt: now,
    updatedAt: now,
  }
}

/** Mock WhatsApp-derived November 2026 orders demonstrating pricing rules. */
export const MOCK_ORDERS: FoodOrder[] = [
  // Week Nov 2–6
  build({ personId: 'ken', personName: 'Ken', date: '2026-11-02', mealNameZh: '豉椒雞球飯', addons: [{ kind: 'soup', nameZh: '湯' }] }),
  build({ personId: 'ken', personName: 'Ken', date: '2026-11-03', mealNameZh: '四季豆排骨飯', addons: [{ kind: 'drink', nameZh: '凍檸茶' }] }),
  build({ personId: 'ken', personName: 'Ken', date: '2026-11-04', mealNameZh: '咖喱雞飯', addons: [{ kind: 'soup', nameZh: '湯' }] }),
  build({ personId: 'roy', personName: 'Roy', date: '2026-11-02', mealNameZh: '魚香茄子飯', addons: [{ kind: 'soup', nameZh: '湯' }] }),
  build({ personId: 'roy', personName: 'Roy', date: '2026-11-03', mealNameZh: '麻婆豆腐飯', addons: [{ kind: 'soup', nameZh: '湯' }] }),
  build({
    personId: 'roy',
    personName: 'Roy',
    date: '2026-11-05',
    mealNameZh: '汶腩飯',
    addons: [{ kind: 'soup', nameZh: '湯' }],
    remark: '菜單係汶腩飯，改雞胸，暫按 $50',
    forceStatus: 'provisional',
    forceAmountHkd: 50,
  }),
  build({ personId: 'jason', personName: 'Jason', date: '2026-11-02', mealNameZh: '海南雞飯', addons: [{ kind: 'drink', nameZh: '可樂' }] }),
  build({ personId: 'jason', personName: 'Jason', date: '2026-11-04', mealNameZh: '豉汁排骨飯', addons: [{ kind: 'soup', nameZh: '湯' }] }),
  build({ personId: 'mandy', personName: 'Mandy', date: '2026-11-03', mealNameZh: '西炒飯', addons: [{ kind: 'soup', nameZh: '湯' }] }),
  build({ personId: 'mandy', personName: 'Mandy', date: '2026-11-05', mealNameZh: '鹹蛋肉餅飯', addons: [{ kind: 'drink', nameZh: '檸檬水' }] }),
  build({ personId: 'venus', personName: 'Venus', date: '2026-11-02', mealNameZh: '番茄牛腩飯', addons: [{ kind: 'soup', nameZh: '湯' }] }),
  build({ personId: 'billy', personName: 'Billy', date: '2026-11-04', mealNameZh: '豉油雞飯', addons: [{ kind: 'soup', nameZh: '湯' }] }),

  // Week Nov 9–13
  build({ personId: 'ken', personName: 'Ken', date: '2026-11-09', mealNameZh: '豉椒雞球飯', addons: [{ kind: 'soup', nameZh: '湯' }] }),
  build({ personId: 'ken', personName: 'Ken', date: '2026-11-10', mealNameZh: '四季豆排骨飯', addons: [{ kind: 'drink', nameZh: '凍檸茶' }] }),
  build({ personId: 'ken', personName: 'Ken', date: '2026-11-11', mealNameZh: '咖喱雞飯', addons: [{ kind: 'soup', nameZh: '湯' }] }),
  build({ personId: 'roy', personName: 'Roy', date: '2026-11-09', mealNameZh: '魚香茄子飯', addons: [{ kind: 'soup', nameZh: '湯' }] }),
  build({
    personId: 'roy',
    personName: 'Roy',
    date: '2026-11-12',
    mealNameZh: '菜遠肉片河',
    mealOnMenu: false,
    addons: [
      { kind: 'soup', nameZh: '湯' },
      { kind: 'other', nameZh: '咖啡菜單', onMenu: false },
    ],
    remark: '未計價',
  }),
  build({ personId: 'jason', personName: 'Jason', date: '2026-11-10', mealNameZh: '海南雞飯', addons: [{ kind: 'soup', nameZh: '湯' }] }),
  build({ personId: 'jason', personName: 'Jason', date: '2026-11-11', mealNameZh: '麻婆豆腐飯', addons: [{ kind: 'drink', nameZh: '凍檸茶' }] }),
  build({ personId: 'mandy', personName: 'Mandy', date: '2026-11-09', mealNameZh: '西炒飯', addons: [{ kind: 'soup', nameZh: '湯' }] }),
  build({ personId: 'mandy', personName: 'Mandy', date: '2026-11-13', mealNameZh: '鹹蛋肉餅飯', addons: [{ kind: 'soup', nameZh: '湯' }] }),
  build({ personId: 'venus', personName: 'Venus', date: '2026-11-10', mealNameZh: '番茄牛腩飯', addons: [{ kind: 'drink', nameZh: '咖啡' }] }),
  build({ personId: 'billy', personName: 'Billy', date: '2026-11-11', mealNameZh: '豉油雞飯', addons: [{ kind: 'soup', nameZh: '湯' }] }),
  build({ personId: 'alice', personName: 'Alice', date: '2026-11-12', mealNameZh: '豉椒雞球飯', addons: [{ kind: 'soup', nameZh: '湯' }] }),
  build({ personId: 'tom', personName: 'Tom', date: '2026-11-13', mealNameZh: '四季豆排骨飯', addons: [{ kind: 'drink', nameZh: '可樂' }] }),

  // Week Nov 16–20
  build({ personId: 'ken', personName: 'Ken', date: '2026-11-16', mealNameZh: '豉椒雞球飯', addons: [{ kind: 'soup', nameZh: '湯' }] }),
  build({ personId: 'ken', personName: 'Ken', date: '2026-11-17', mealNameZh: '四季豆排骨飯', addons: [{ kind: 'drink', nameZh: '凍檸茶' }] }),
  build({ personId: 'ken', personName: 'Ken', date: '2026-11-18', mealNameZh: '咖喱雞飯', addons: [{ kind: 'soup', nameZh: '湯' }] }),
  build({ personId: 'roy', personName: 'Roy', date: '2026-11-16', mealNameZh: '魚香茄子飯', addons: [{ kind: 'soup', nameZh: '湯' }] }),
  build({
    personId: 'roy',
    personName: 'Roy',
    date: '2026-11-20',
    mealNameZh: '菜遠肉片河',
    mealOnMenu: false,
    addons: [{ kind: 'soup', nameZh: '湯' }, { kind: 'other', nameZh: '咖啡菜單', onMenu: false }],
    remark: '未計價',
  }),
  build({ personId: 'jason', personName: 'Jason', date: '2026-11-17', mealNameZh: '海南雞飯', addons: [{ kind: 'soup', nameZh: '湯' }] }),
  build({ personId: 'mandy', personName: 'Mandy', date: '2026-11-18', mealNameZh: '西炒飯', addons: [{ kind: 'drink', nameZh: '檸檬水' }] }),
  build({ personId: 'venus', personName: 'Venus', date: '2026-11-19', mealNameZh: '番茄牛腩飯', addons: [{ kind: 'soup', nameZh: '湯' }] }),
  build({ personId: 'billy', personName: 'Billy', date: '2026-11-16', mealNameZh: '豉油雞飯', addons: [{ kind: 'soup', nameZh: '湯' }] }),
]

export const MOCK_LEAVE: LeaveRequest[] = [
  {
    id: 'leave_ken_2026-12_01',
    personId: 'ken',
    personName: 'Ken',
    monthKey: '2026-12',
    startDate: '2026-12-08',
    endDate: '2026-12-09',
    leaveType: 'annual',
    note: 'Family trip',
    status: 'submitted',
    source: 'mock',
    createdAt: '2026-11-01T10:00:00+08:00',
    updatedAt: '2026-11-01T10:00:00+08:00',
  },
  {
    id: 'leave_roy_2026-12_01',
    personId: 'roy',
    personName: 'Roy',
    monthKey: '2026-12',
    startDate: '2026-12-24',
    endDate: '2026-12-31',
    leaveType: 'annual',
    note: 'Year-end break',
    status: 'submitted',
    source: 'mock',
    createdAt: '2026-11-01T11:00:00+08:00',
    updatedAt: '2026-11-01T11:00:00+08:00',
  },
]
