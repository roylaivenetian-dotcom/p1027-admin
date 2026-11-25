import { useMemo, useState, type FormEvent } from 'react'
import type { LeaveRequest, LeaveType, Person } from '../types'
import { comingMonthKey, hktParts, isFirstOfMonthHkt, monthKey } from '../lib/dates'

interface Props {
  people: Person[]
  leave: LeaveRequest[]
  onSubmit: (payload: {
    personId: string
    personName: string
    monthKey: string
    startDate: string
    endDate: string
    leaveType: LeaveType
    note?: string
  }) => void
  onCancel: (id: string) => void
}

const TYPES: { value: LeaveType; label: string }[] = [
  { value: 'annual', label: 'Annual / 年假' },
  { value: 'sick', label: 'Sick / 病假' },
  { value: 'unpaid', label: 'Unpaid / 無薪' },
  { value: 'other', label: 'Other / 其他' },
]

export function LeavePanel({ people, leave, onSubmit, onCancel }: Props) {
  const firstDay = isFirstOfMonthHkt()
  const targetMonth = comingMonthKey()
  const todayParts = hktParts()
  const thisMonthKey = monthKey(todayParts.year, todayParts.month)

  const [personId, setPersonId] = useState(people[0]?.id ?? '')
  const [startDate, setStartDate] = useState(`${targetMonth}-01`)
  const [endDate, setEndDate] = useState(`${targetMonth}-01`)
  const [leaveType, setLeaveType] = useState<LeaveType>('annual')
  const [note, setNote] = useState('')
  const [monthFilter, setMonthFilter] = useState(targetMonth)

  const visible = useMemo(
    () => leave.filter((l) => l.monthKey === monthFilter && l.status !== 'cancelled'),
    [leave, monthFilter],
  )

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const person = people.find((p) => p.id === personId)
    if (!person) return
    onSubmit({
      personId: person.id,
      personName: person.name,
      monthKey: targetMonth,
      startDate,
      endDate,
      leaveType,
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
            <span>Submit leave for {targetMonth} (coming month).</span>
          </>
        ) : (
          <>
            <strong>Leave applications</strong>
            <span>
              Primary collection day is the 1st of each month (Asia/Hong_Kong). You can still record leave for{' '}
              {targetMonth}; the form is highlighted on the 1st.
            </span>
          </>
        )}
      </div>

      <div className="leave-layout">
        <form className="leave-form" onSubmit={handleSubmit}>
          <h2>Apply for leave · {targetMonth}</h2>
          <label>
            Person
            <select value={personId} onChange={(e) => setPersonId(e.target.value)} required>
              {people
                .filter((p) => p.active)
                .map((p) => (
                  <option key={p.id} value={p.id}>
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
            <select value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveType)}>
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
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
            Simple self-serve record (no approval workflow yet). Today HKT: {thisMonthKey}-{String(todayParts.day).padStart(2, '0')}.
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
                  <strong>{l.personName}</strong> · {l.leaveType}
                  <div className="leave-meta">
                    {l.startDate} → {l.endDate}
                    {l.note ? ` · ${l.note}` : ''}
                  </div>
                </div>
                <button type="button" className="btn-ghost" onClick={() => onCancel(l.id)}>
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
