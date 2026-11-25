const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

interface Props {
  year: number
  month: number
  onChange: (year: number, month: number) => void
}

export function MonthNav({ year, month, onChange }: Props) {
  return (
    <header className="month-nav">
      <div className="month-nav-row">
        <button type="button" className="nav-chip year-chip" onClick={() => onChange(year, month)}>
          YEAR
        </button>
        {MONTHS.map((label, i) => {
          const m = i + 1
          return (
            <button
              key={label}
              type="button"
              className={`nav-chip month-chip${m === month ? ' active' : ''}`}
              onClick={() => onChange(year, m)}
            >
              {label}
            </button>
          )
        })}
      </div>
      <div className="month-nav-row secondary">
        <button type="button" className="nav-arrow" aria-label="Previous year" onClick={() => onChange(year - 1, month)}>
          ‹
        </button>
        <span className="year-label">{year}</span>
        <button type="button" className="nav-arrow" aria-label="Next year" onClick={() => onChange(year + 1, month)}>
          ›
        </button>
        {Array.from({ length: 12 }, (_, i) => {
          const m = i + 1
          return (
            <button
              key={m}
              type="button"
              className={`nav-num${m === month ? ' active' : ''}`}
              onClick={() => onChange(year, m)}
            >
              {String(m).padStart(2, '0')}
            </button>
          )
        })}
      </div>
    </header>
  )
}
