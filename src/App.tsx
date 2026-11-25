import { useState } from 'react'
import { FoodBoard } from './components/FoodBoard'
import { LeavePanel } from './components/LeavePanel'
import { MenuAdmin } from './components/MenuAdmin'
import { useWorkplaceData } from './hooks/useWorkplaceData'
import { mockBotPushSample } from './services/store'
import { hktParts } from './lib/dates'
import './App.css'

type Tab = 'food' | 'leave' | 'menu'

export default function App() {
  const today = hktParts()
  const [year, setYear] = useState(2026)
  const [month, setMonth] = useState(11)
  const [tab, setTab] = useState<Tab>('food')
  const data = useWorkplaceData(year, month)

  return (
    <div className="app-shell">
      <div className="top-bar">
        <div className="brand">
          <span className="brand-mark">Roy Console</span>
          <span className="brand-sub">Food & Leave · 午膳 / 請假</span>
        </div>
        <nav className="tabs">
          <button type="button" className={tab === 'food' ? 'active' : ''} onClick={() => setTab('food')}>
            Food summary
          </button>
          <button type="button" className={tab === 'leave' ? 'active' : ''} onClick={() => setTab('leave')}>
            Leave
          </button>
          <button type="button" className={tab === 'menu' ? 'active' : ''} onClick={() => setTab('menu')}>
            Menu
          </button>
        </nav>
        <div className="status-pill" title={data.error ?? undefined}>
          <span className={`dot ${data.source}`} />
          {data.status}
        </div>
      </div>

      <main>
        {tab === 'food' && (
          <>
            <FoodBoard
              year={year}
              month={month}
              onMonthChange={(y, m) => {
                setYear(y)
                setMonth(m)
              }}
              people={data.people}
              orders={data.orders}
            />
            <div className="dev-tools">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  mockBotPushSample()
                  if (data.source === 'mock') {
                    /* store subscription refreshes */
                  }
                }}
              >
                Simulate WhatsApp order push
              </button>
              <button type="button" className="btn-ghost" onClick={() => data.resetMockData()}>
                Reset mock data
              </button>
              <span className="form-hint">
                HKT today {today.year}-{String(today.month).padStart(2, '0')}-{String(today.day).padStart(2, '0')}
              </span>
            </div>
          </>
        )}
        {tab === 'leave' && (
          <LeavePanel
            people={data.people}
            leave={data.leave}
            onSubmit={(p) => data.createLeave({ ...p, source: 'app' })}
            onCancel={data.cancelLeave}
          />
        )}
        {tab === 'menu' && <MenuAdmin menu={data.menu} onSave={data.saveMenu} />}
      </main>
    </div>
  )
}
