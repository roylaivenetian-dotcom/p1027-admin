import type { FoodOrderView, MenuItem, UpsertOrderPayload } from '../types'

export const MEAL_PRICE = 50
export const SOUP_PRICE = 0
export const DRINK_PRICE = 5

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '')
}

export function findMenuItem(menu: MenuItem[], nameZh: string): MenuItem | undefined {
  const key = normalize(nameZh)
  return menu.find(
    (m) =>
      m.active &&
      (normalize(m.nameZh) === key ||
        m.aliases?.some((a) => normalize(a) === key) ||
        (m.nameEn && normalize(m.nameEn) === key)),
  )
}

/** Price per Bot feed rules → amount 50 / 55 / 0 */
export function priceFromParts(
  dish: string,
  soup: boolean,
  drink: string | null | undefined,
  menu: MenuItem[],
  onMenuOverride?: boolean,
): { onMenu: boolean; amount: number } {
  const mealMatch = findMenuItem(menu, dish)
  const onMenu = onMenuOverride ?? Boolean(mealMatch)
  if (!onMenu) return { onMenu: false, amount: 0 }
  let amount = mealMatch?.priceHkd ?? MEAL_PRICE
  if (drink) {
    const drinkMatch = findMenuItem(menu, drink)
    amount += drinkMatch?.priceHkd ?? DRINK_PRICE
  }
  void soup // free
  return { onMenu: true, amount }
}

export function toOrderView(
  doc: {
    id: string
    person: string
    date: string
    dish: string
    soup: boolean
    drink: string | null
    extras?: string[]
    onMenu: boolean
    amount: number
    remark: string | null
  },
): FoodOrderView {
  const provisional = Boolean(doc.remark?.includes('暫'))
  const status = !doc.onMenu || doc.amount === 0 ? 'unpriced' : provisional ? 'provisional' : 'priced'
  return {
    id: doc.id,
    personName: doc.person,
    date: doc.date,
    dish: doc.dish,
    soup: doc.soup,
    drink: doc.drink,
    extras: doc.extras ?? [],
    onMenu: doc.onMenu,
    amount: doc.amount,
    remark: doc.remark,
    status,
  }
}

export function buildOrderDoc(payload: UpsertOrderPayload, menu: MenuItem[]): import('../types').FoodOrderDoc {
  const soup = payload.soup ?? false
  const drink = payload.drink ?? null
  const priced =
    payload.amount != null && payload.onMenu != null
      ? { onMenu: payload.onMenu, amount: payload.amount }
      : priceFromParts(payload.dish, soup, drink, menu, payload.onMenu)
  const id = payload.sourceMessageId
    ? `${payload.person}_${payload.date}_${payload.sourceMessageId}`
    : `${payload.person}_${payload.date}`
  const now = new Date().toISOString()
  return {
    id,
    person: payload.person,
    date: payload.date,
    dish: payload.dish,
    soup,
    drink,
    extras: payload.extras ?? [],
    onMenu: priced.onMenu,
    amount: priced.onMenu ? priced.amount : 0,
    remark: payload.remark ?? (priced.onMenu ? null : '未計價'),
    sourceJid: payload.sourceJid ?? null,
    sourceMessageId: payload.sourceMessageId ?? null,
    updatedAt: now,
  }
}

export function formatOrderLine(order: FoodOrderView): string {
  const d = order.date.slice(8, 10) + '/' + order.date.slice(5, 7)
  const parts = [order.dish]
  if (order.soup) parts.push('+ 湯')
  if (order.drink) parts.push(`+ ${order.drink}`)
  if (order.extras.length) parts.push(order.extras.join(', '))
  const dish = parts.join(' ')
  if (order.status === 'unpriced' || !order.onMenu) {
    const remark = order.remark && order.remark.includes('未計價') ? order.remark : [order.remark, '未計價'].filter(Boolean).join(', ')
    return `${d} ${dish}${remark ? `, ${remark}` : ', 未計價'}`
  }
  const suffix = order.remark ? ` (${order.remark})` : ''
  return `${d} ${dish} - $${order.amount}${suffix}`
}

export function sumPersonWeek(orders: FoodOrderView[]): { total: number; provisional: boolean } {
  let total = 0
  let provisional = false
  for (const o of orders) {
    if (!o.onMenu || o.status === 'unpriced') continue
    total += o.amount
    if (o.status === 'provisional') provisional = true
  }
  return { total, provisional }
}
