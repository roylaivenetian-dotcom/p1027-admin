import { useMemo, useState, type FormEvent } from 'react'
import type { LeaveRecordDoc, Person } from '../types'
import { MonthNav } from './MonthNav'
import { formatLeaveBullet, leaveBucket, sortLeaveRecords } from '../lib/leaveFormat'
import { isFirstOfMonthHkt, monthKey } from '../lib/dates'

interface Props {
  year: number
  month: number
  onMonthChange: (year: number, month: number) => void
  people: Person[]
  leave: LeaveRecordDoc[]
  onSubmit: (payload: {
    person: string
    month: string
    type: string
    dates: string[]
    halfDay?: 'AM' | 'PM' | null
    note?: string
  }) => void
  onCancel: (id: string) => void
}

export function LeavePanel({
  year,
  month,
  onMonthChange,
  people,
  leave,
  onSubmit,
  onCancel,
}: Props) {
  const monthFilter = monthKey(year, month)
  const firstDay = isFirstOfMonthHkt()
  const [showAdd, setShowAdd] = useState(false)
  const [person, setPerson] = useState(people[0]?.name ?? 'Ken')
  const [startDate, setStartDate] = useState(`${monthFilter}-01`)
  const [endDate, setEndDate] = useState(`${monthFilter}-01`)
  const [leaveType, setLeaveType] = useState('annual')
  const [halfDay, setHalfDay] = useState<'' | 'AM' | 'PM'>('')
  const [note, setNote] = useState('')

  const { al, sl, other } = useMemo(() => {
    const rows = leave.filter((l) => l.month === monthFilter).sort(sortLeaveRecords)
    return {
      al: rows.filter((l) => leaveBucket(l.type) === 'AL'),
      sl: rows.filter((l) => leaveBucket(l.type) === 'SL'),
      other: rows.filter((l) => leaveBucket(l.type) === 'other'),
    }
  }, [leave, monthFilter])

  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })

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
    const dates = datesBetween(startDate, endDate)
    onSubmit({
      person,
      month: monthFilter,
      type: leaveType,
      dates,
      halfDay: dates.length === 1 && halfDay ? halfDay : null,
      note: note.trim() || undefined,
    })
    setNote('')
    setShowAdd(false)
  }

  return (
    <section className={`leave-board${firstDay ? ' leave-open' : ''}`}>
      <MonthNav year={year} month={month} onChange={onMonthChange} />

      <article className="leave-summary-panel">
        <header className="leave-summary-head">
          <h2>P1027 Admin Group · leave · {monthLabel}</h2>
          {firstDay && <span className="leave-window-tag">1st · leave window open</span>}
        </header>

        <LeaveSection title="Annual leave (AL)" records={al} onCancel={onCancel} />
        <LeaveSection title="Sick leave (SL)" records={sl} onCancel={onCancel} />
        {other.length > 0 && <LeaveSection title="Other" records={other} onCancel={onCancel} />}

        <p className="board-footnote">
          Summary style for P1027 Admin Group. Lines: <code>3 Nov — Name</code>,{' '}
          <code>4 Nov, PM — Name</code>, <code>2–4 Nov — Name</code>. Collection: leaveRequests.
        </p>
      </article>

      <div className="leave-add-bar">
        <button type="button" className="btn-ghost" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? 'Hide add form' : 'Add leave record'}
        </button>
      </div>

      {showAdd && (
        <form className="leave-form leave-form-compact" onSubmit={handleSubmit}>
          <h3>Add · {monthFilter}</h3>
          <div className="leave-form-grid">
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
            <label>
              Type
              <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)}>
                <option value="annual">Annual leave (AL)</option>
                <option value="sick">Sick leave (SL)</option>
                <option value="unpaid">Unpaid</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Start
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
            </label>
            <label>
              End
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </label>
            <label>
              Half-day (single date)
              <select value={halfDay} onChange={(e) => setHalfDay(e.target.value as '' | 'AM' | 'PM')}>
                <option value="">Full day</option>
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </label>
            <label>
              Note
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
            </label>
          </div>
          <button type="submit" className="btn-primary">
            Save
          </button>
        </form>
      )}
    </section>
  )
}

function LeaveSection({
  title,
  records,
  onCancel,
}: {
  title: string
  records: LeaveRecordDoc[]
  onCancel: (id: string) => void
}) {
  return (
    <div className="leave-section">
      <h3 className="leave-section-title">{title}:</h3>
      {records.length === 0 ? (
        <p className="leave-empty">—</p>
      ) : (
        <ul className="leave-bullets">
          {records.map((l) => (
            <li key={l.id}>
              <span>{formatLeaveBullet(l)}</span>
              <button type="button" className="btn-ghost leave-remove" onClick={() => onCancel(l.id)} aria-label={`Remove ${l.person}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
