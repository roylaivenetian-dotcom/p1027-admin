import { useMemo } from 'react'
import type { FoodOrder, Person } from '../types'
import { workingWeeksInMonth, inRange, formatDisplayDate } from '../lib/dates'
import { formatOrderLine, sumPersonWeek } from '../lib/pricing'
import { MonthNav } from './MonthNav'

interface Props {
  year: number
  month: number
  onMonthChange: (year: number, month: number) => void
  people: Person[]
  orders: FoodOrder[]
}

export function FoodBoard({ year, month, onMonthChange, people, orders }: Props) {
  const weeks = useMemo(() => workingWeeksInMonth(year, month), [year, month])

  return (
    <section className="food-board">
      <MonthNav year={year} month={month} onChange={onMonthChange} />
      <div className="week-grid">
        {weeks.map((week) => {
          const weekOrders = orders.filter((o) => inRange(o.date, week.start, week.end))
          const peopleInWeek = people
            .filter((p) => p.active)
            .filter((p) => weekOrders.some((o) => o.personId === p.id))
            .sort((a, b) => a.sortOrder - b.sortOrder)

          return (
            <article key={week.start} className="week-panel">
              <h2 className="week-title">{week.label}</h2>
              {peopleInWeek.length === 0 && <p className="empty-week">No orders this week</p>}
              {peopleInWeek.map((person) => {
                const personOrders = weekOrders
                  .filter((o) => o.personId === person.id)
                  .sort((a, b) => a.date.localeCompare(b.date))
                const { total, provisional } = sumPersonWeek(personOrders)
                return (
                  <div key={person.id} className="person-block">
                    <h3 className="person-total">
                      {person.name} : ${total}
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
        Pricing: meal HK$50 · soup free · drink +HK$5 · off-menu → 未計價 (excluded from totals). Dates shown as{' '}
        {formatDisplayDate(`${year}-${String(month).padStart(2, '0')}-01`)} style (DD/MM).
      </p>
    </section>
  )
}
