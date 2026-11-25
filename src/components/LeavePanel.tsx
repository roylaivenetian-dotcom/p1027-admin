import { useMemo, useState, type FormEvent } from 'react'
import type { LeaveRecordDoc, Person } from '../types'
import { comingMonthKey, hktParts, isFirstOfMonthHkt, monthKey } from '../lib/dates'

interface Props {
  people: Person[]
  leave: LeaveRecordDoc[]
  onSubmit: (payload: {
    person: string
    month: string
    type: string
    dates: string[]
    note?: string
  }) => void
  onCancel: (id: string) => void
}

export function LeavePanel({ people, leave, onSubmit, onCancel }: Props) {
  const firstDay = isFirstOfMonthHkt()
  const targetMonth = comingMonthKey()
  const todayParts = hktParts()
  const thisMonthKey = monthKey(todayParts.year, todayParts.month)

  const [person, setPerson] = useState(people[0]?.name ?? 'Ken')
  const [startDate, setStartDate] = useState(`${targetMonth}-01`)
  const [endDate, setEndDate] = useState(`${targetMonth}-01`)
  const [leaveType, setLeaveType] = useState('leave')
  const [note, setNote] = useState('')
  const [monthFilter, setMonthFilter] = useState(targetMonth)

  const visible = useMemo(
    () => leave.filter((l) => l.month === monthFilter),
    [leave, monthFilter],
  )

  function datesBetween(start: string, end: string): string[] {
    const out: string[] = []
    const cur = new Date(`${start}T00:00:00+08:00`)
    const last = new Date(`${end}T00:00:00+08:00`)
    while (cur <= last) {
      out.push(cur.toISOString().slice(0, 10))
      cur.setDate(cur.getDate() + 1)
    }
    return out.length ? out : [start]
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSubmit({
      person,
      month: targetMonth,
      type: leaveType,
      dates: datesBetween(startDate, endDate),
      note: note.trim() || undefined,
    })
    setNote('')
  }

  return (
    <section className={`leave-panel${firstDay ? ' leave-open' : ''}`}>
      <div className="leave-banner">
        {firstDay ? (
          <>
            <strong>今天是每月 1 號 — Leave window open</strong>
            <span>Submit leave for {targetMonth} (coming month). Collection: leaveRequests.</span>
          </>
        ) : (
          <>
            <strong>Leave applications</strong>
            <span>
              Primary collection day is the 1st of each month (Asia/Hong_Kong). Form targets {targetMonth}.
            </span>
          </>
        )}
      </div>

      <div className="leave-layout">
        <form className="leave-form" onSubmit={handleSubmit}>
          <h2>Apply for leave · {targetMonth}</h2>
          <label>
            Person
            <select value={person} onChange={(e) => setPerson(e.target.value)} required>
              {people
                .filter((p) => p.active)
                .map((p) => (
                  <option key={p.id} value={p.name}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="leave-dates">
            <label>
              Start
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </label>
            <label>
              End
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </label>
          </div>
          <label>
            Type
            <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
              <option value="leave">Leave / 請假</option>
              <option value="annual">Annual / 年假</option>
              <option value="sick">Sick / 病假</option>
              <option value="unpaid">Unpaid / 無薪</option>
              <option value="other">Other / 其他</option>
            </select>
          </label>
          <label>
            Note
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional" />
          </label>
          <button type="submit" className="btn-primary">
            Submit leave record
          </button>
          <p className="form-hint">
            Self-serve record (approval TBD). Writes leaveRequests shape. Today HKT: {thisMonthKey}-
            {String(todayParts.day).padStart(2, '0')}.
          </p>
        </form>

        <div className="leave-list">
          <div className="leave-list-head">
            <h2>Records</h2>
            <input
              type="month"
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              aria-label="Filter month"
            />
          </div>
          {visible.length === 0 && <p className="empty-week">No leave records for {monthFilter}</p>}
          <ul>
            {visible.map((l) => (
              <li key={l.id} className="leave-item">
                <div>
                  <strong>{l.person}</strong> · {l.type}
                  <div className="leave-meta">
                    {l.dates.length ? `${l.dates[0]} → ${l.dates[l.dates.length - 1]} (${l.dates.length}d)` : '—'}
                    {l.note ? ` · ${l.note}` : ''}
                  </div>
                </div>
                <button type="button" className="btn-ghost" onClick={() => onCancel(l.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
