import type { FoodOrder, MenuItem, OrderAddon, OrderLineStatus, UpsertOrderPayload } from '../types'

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

/**
 * Price an order from fixed menu rules:
 * - meal on menu → HK$50
 * - soup → free
 * - drink → +HK$5
 * - anything not on menu → remark only, do not add to person total (未計價)
 */
export function priceOrder(
  payload: UpsertOrderPayload,
  menu: MenuItem[],
): Pick<FoodOrder, 'mealOnMenu' | 'addons' | 'amountHkd' | 'status' | 'remark'> {
  if (payload.forceStatus === 'unpriced') {
    return {
      mealOnMenu: false,
      addons: payload.addons ?? [],
      amountHkd: 0,
      status: 'unpriced',
      remark: payload.remark ?? '未計價',
    }
  }

  if (payload.forceAmountHkd != null && payload.forceStatus) {
    return {
      mealOnMenu: payload.mealOnMenu ?? true,
      addons: payload.addons ?? [],
      amountHkd: payload.forceAmountHkd,
      status: payload.forceStatus,
      remark: payload.remark,
    }
  }

  const mealMatch =
    payload.mealOnMenu === false ? undefined : findMenuItem(menu, payload.mealNameZh)
  const mealOnMenu = payload.mealOnMenu ?? Boolean(mealMatch)

  const addons: OrderAddon[] = (payload.addons ?? []).map((a) => {
    if (a.kind === 'soup') {
      return { ...a, priceHkd: SOUP_PRICE, onMenu: a.onMenu ?? true }
    }
    if (a.kind === 'drink') {
      const drinkMatch = findMenuItem(menu, a.nameZh)
      const onMenu = a.onMenu ?? Boolean(drinkMatch)
      return {
        ...a,
        onMenu,
        priceHkd: onMenu ? (drinkMatch?.priceHkd ?? DRINK_PRICE) : 0,
      }
    }
    const otherMatch = findMenuItem(menu, a.nameZh)
    return {
      ...a,
      onMenu: a.onMenu ?? Boolean(otherMatch),
      priceHkd: otherMatch?.priceHkd ?? 0,
    }
  })

  const offMenuAddon = addons.some((a) => !a.onMenu && a.kind !== 'soup')
  if (!mealOnMenu || offMenuAddon) {
    const bits = [payload.remark, !mealOnMenu || offMenuAddon ? '未計價' : undefined].filter(Boolean)
    return {
      mealOnMenu,
      addons,
      amountHkd: 0,
      status: 'unpriced',
      remark: bits.join(' · ') || '未計價',
    }
  }

  let amount = mealMatch?.priceHkd ?? MEAL_PRICE
  for (const a of addons) {
    if (a.onMenu) amount += a.priceHkd
  }

  const provisional = Boolean(payload.remark?.includes('暫') || payload.forceStatus === 'provisional')
  const status: OrderLineStatus = provisional ? 'provisional' : 'priced'

  return {
    mealOnMenu: true,
    addons,
    amountHkd: amount,
    status,
    remark: payload.remark,
  }
}

export function formatOrderLine(order: FoodOrder): string {
  const d = order.date.slice(8, 10) + '/' + order.date.slice(5, 7)
  const addonPart = order.addons
    .map((a) => `+ ${a.nameZh}`)
    .join(', ')
  const dish = addonPart ? `${order.mealNameZh} ${addonPart}` : order.mealNameZh
  if (order.status === 'unpriced') {
    const remark = order.remark ? `, ${order.remark}` : ', 未計價'
    return `${d} ${dish}${remark.includes('未計價') ? remark : `${remark}, 未計價`}`
  }
  const suffix = order.remark ? ` (${order.remark})` : ''
  return `${d} ${dish} - $${order.amountHkd}${suffix}`
}

export function sumPersonWeek(orders: FoodOrder[]): { total: number; provisional: boolean; hasUnpriced: boolean } {
  let total = 0
  let provisional = false
  let hasUnpriced = false
  for (const o of orders) {
    if (o.status === 'unpriced') {
      hasUnpriced = true
      continue
    }
    total += o.amountHkd
    if (o.status === 'provisional') provisional = true
  }
  return { total, provisional, hasUnpriced }
}
