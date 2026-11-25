import { useMemo } from 'react'
import type { FoodOrderDoc, Person } from '../types'
import { workingWeeksInMonth, inRange, formatDisplayDate } from '../lib/dates'
import { formatOrderLine, sumPersonWeek, toOrderView } from '../lib/pricing'
import { MonthNav } from './MonthNav'

interface Props {
  year: number
  month: number
  onMonthChange: (year: number, month: number) => void
  people: Person[]
  orders: FoodOrderDoc[]
}

export function FoodBoard({ year, month, onMonthChange, people, orders }: Props) {
  const weeks = useMemo(() => workingWeeksInMonth(year, month), [year, month])
  const views = useMemo(() => orders.map(toOrderView), [orders])

  return (
    <section className="food-board">
      <MonthNav year={year} month={month} onChange={onMonthChange} />
      <div className="week-grid">
        {weeks.map((week) => {
          const weekOrders = views.filter((o) => inRange(o.date, week.start, week.end))
          const names = [
            ...people.filter((p) => p.active).map((p) => p.name),
            ...weekOrders.map((o) => o.personName),
          ]
          const uniqueNames = [...new Set(names)].filter((n) =>
            weekOrders.some((o) => o.personName === n),
          )
          uniqueNames.sort((a, b) => {
            const ao = people.find((p) => p.name === a)?.sortOrder ?? 99
            const bo = people.find((p) => p.name === b)?.sortOrder ?? 99
            return ao - bo || a.localeCompare(b)
          })

          return (
            <article key={week.start} className="week-panel">
              <h2 className="week-title">{week.label}</h2>
              {uniqueNames.length === 0 && <p className="empty-week">No orders this week</p>}
              {uniqueNames.map((name) => {
                const personOrders = weekOrders
                  .filter((o) => o.personName === name)
                  .sort((a, b) => a.date.localeCompare(b.date))
                const { total, provisional } = sumPersonWeek(personOrders)
                return (
                  <div key={name} className="person-block">
                    <h3 className="person-total">
                      {name} : ${total}
                      {provisional ? ' (暫計)' : ''}
                    </h3>
                    <ul className="order-lines">
                      {personOrders.map((o) => (
                        <li key={o.id} className={o.status === 'unpriced' ? 'unpriced' : undefined}>
                          {formatOrderLine(o)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </article>
          )
        })}
      </div>
      <p className="board-footnote">
        Pricing: meal HK$50 · soup free · drink +HK$5 · off-menu → 未計價 (excluded from totals). Dates{' '}
        {formatDisplayDate(`${year}-${String(month).padStart(2, '0')}-01`)} (DD/MM). Schema:{' '}
        <code>orders</code>.
      </p>
    </section>
  )
}
