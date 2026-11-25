import type { FoodOrderDoc, LeaveRecordDoc } from '../types'
import { toOrderView } from '../lib/pricing'

function order(
  partial: Omit<FoodOrderDoc, 'sourceJid' | 'sourceMessageId' | 'updatedAt' | 'extras'> & {
    extras?: string[]
  },
): FoodOrderDoc {
  return {
    extras: partial.extras ?? [],
    sourceJid: '85297868213-1620171799@g.us',
    sourceMessageId: null,
    updatedAt: '2026-11-20T09:00:00+08:00',
    ...partial,
  }
}

/** Mock WhatsApp-shaped docs matching foodOrders collection. */
export const MOCK_FOOD_ORDERS: FoodOrderDoc[] = [
  order({ id: 'Ken_2026-11-02', person: 'Ken', date: '2026-11-02', dish: '豉椒雞球飯', soup: true, drink: null, onMenu: true, amount: 50, remark: null }),
  order({ id: 'Ken_2026-11-03', person: 'Ken', date: '2026-11-03', dish: '四季豆排骨飯', soup: false, drink: '凍檸茶', onMenu: true, amount: 55, remark: null }),
  order({ id: 'Ken_2026-11-04', person: 'Ken', date: '2026-11-04', dish: '咖喱雞飯', soup: true, drink: null, onMenu: true, amount: 50, remark: null }),
  order({ id: 'Roy_2026-11-02', person: 'Roy', date: '2026-11-02', dish: '魚香茄子飯', soup: true, drink: null, onMenu: true, amount: 50, remark: null }),
  order({ id: 'Roy_2026-11-03', person: 'Roy', date: '2026-11-03', dish: '麻婆豆腐飯', soup: true, drink: null, onMenu: true, amount: 50, remark: null }),
  order({
    id: 'Roy_2026-11-05',
    person: 'Roy',
    date: '2026-11-05',
    dish: '汶腩飯',
    soup: true,
    drink: null,
    onMenu: true,
    amount: 50,
    remark: '菜單係汶腩飯，改雞胸，暫按 $50',
  }),
  order({ id: 'Yin_2026-11-02', person: 'Yin', date: '2026-11-02', dish: '海南雞飯', soup: false, drink: '可樂', onMenu: true, amount: 55, remark: null }),
  order({ id: 'Ric_2026-11-04', person: 'Ric', date: '2026-11-04', dish: '豉汁排骨飯', soup: true, drink: null, onMenu: true, amount: 50, remark: null }),
  order({ id: 'Tim_2026-11-03', person: 'Tim', date: '2026-11-03', dish: '西炒飯', soup: true, drink: null, onMenu: true, amount: 50, remark: null }),
  order({ id: 'Mandy_2026-11-05', person: 'Mandy', date: '2026-11-05', dish: '鹹蛋肉餅飯', soup: false, drink: '檸檬水', onMenu: true, amount: 55, remark: null }),

  order({ id: 'Ken_2026-11-09', person: 'Ken', date: '2026-11-09', dish: '豉椒雞球飯', soup: true, drink: null, onMenu: true, amount: 50, remark: null }),
  order({ id: 'Ken_2026-11-10', person: 'Ken', date: '2026-11-10', dish: '四季豆排骨飯', soup: false, drink: '凍檸茶', onMenu: true, amount: 55, remark: null }),
  order({ id: 'Ken_2026-11-11', person: 'Ken', date: '2026-11-11', dish: '咖喱雞飯', soup: true, drink: null, onMenu: true, amount: 50, remark: null }),
  order({ id: 'Roy_2026-11-09', person: 'Roy', date: '2026-11-09', dish: '魚香茄子飯', soup: true, drink: null, onMenu: true, amount: 50, remark: null }),
  order({
    id: 'Roy_2026-11-12',
    person: 'Roy',
    date: '2026-11-12',
    dish: '菜遠肉片河',
    soup: true,
    drink: null,
    extras: ['咖啡菜單'],
    onMenu: false,
    amount: 0,
    remark: '未計價',
  }),
  order({ id: 'Yin_2026-11-10', person: 'Yin', date: '2026-11-10', dish: '海南雞飯', soup: true, drink: null, onMenu: true, amount: 50, remark: null }),
  order({ id: 'Ric_2026-11-11', person: 'Ric', date: '2026-11-11', dish: '麻婆豆腐飯', soup: false, drink: '凍檸茶', onMenu: true, amount: 55, remark: null }),
  order({ id: 'Tim_2026-11-13', person: 'Tim', date: '2026-11-13', dish: '西炒飯', soup: true, drink: null, onMenu: true, amount: 50, remark: null }),

  order({ id: 'Ken_2026-11-16', person: 'Ken', date: '2026-11-16', dish: '豉椒雞球飯', soup: true, drink: null, onMenu: true, amount: 50, remark: null }),
  order({ id: 'Ken_2026-11-17', person: 'Ken', date: '2026-11-17', dish: '四季豆排骨飯', soup: false, drink: '凍檸茶', onMenu: true, amount: 55, remark: null }),
  order({ id: 'Ken_2026-11-18', person: 'Ken', date: '2026-11-18', dish: '咖喱雞飯', soup: true, drink: null, onMenu: true, amount: 50, remark: null }),
  order({ id: 'Roy_2026-11-16', person: 'Roy', date: '2026-11-16', dish: '魚香茄子飯', soup: true, drink: null, onMenu: true, amount: 50, remark: null }),
  order({
    id: 'Roy_2026-11-20',
    person: 'Roy',
    date: '2026-11-20',
    dish: '菜遠肉片河',
    soup: true,
    drink: null,
    extras: ['咖啡菜單'],
    onMenu: false,
    amount: 0,
    remark: '未計價',
  }),
  order({ id: 'Venus_2026-11-19', person: 'Venus', date: '2026-11-19', dish: '番茄牛腩飯', soup: true, drink: null, onMenu: true, amount: 50, remark: null }),
  order({ id: 'Billy_2026-11-16', person: 'Billy', date: '2026-11-16', dish: '豉油雞飯', soup: true, drink: null, onMenu: true, amount: 50, remark: null }),
]

export const MOCK_ORDER_VIEWS = MOCK_FOOD_ORDERS.map(toOrderView)

export const MOCK_LEAVE: LeaveRecordDoc[] = [
  {
    id: 'Ken_2026-12_family',
    person: 'Ken',
    month: '2026-12',
    type: 'leave',
    dates: ['2026-12-08', '2026-12-09'],
    note: 'Family trip',
    sourceJid: null,
    sourceMessageId: null,
    updatedAt: '2026-11-01T10:00:00+08:00',
  },
  {
    id: 'Roy_2026-12_yearend',
    person: 'Roy',
    month: '2026-12',
    type: 'leave',
    dates: ['2026-12-24', '2026-12-25', '2026-12-26', '2026-12-29', '2026-12-30', '2026-12-31'],
    note: 'Year-end break',
    sourceJid: null,
    sourceMessageId: null,
    updatedAt: '2026-11-01T11:00:00+08:00',
  },
]
