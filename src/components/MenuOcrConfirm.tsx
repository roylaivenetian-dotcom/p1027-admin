import type { MenuCategory } from '../types'
import type { OcrDishDraft } from '../lib/menuOcr'
import { DRINK_PRICE, MEAL_PRICE, SOUP_PRICE } from '../lib/pricing'
import {
  MENU_WEEKDAYS,
  WEEKDAY_LABEL_ZH,
  type MenuWeekday,
} from '../lib/menuWeekday'

interface Props {
  preview: string
  dishes: OcrDishDraft[]
  effectiveFrom: string
  effectiveTo: string
  note: string
  busy: boolean
  status: string | null
  error: string | null
  onChangeFrom: (v: string) => void
  onChangeTo: (v: string) => void
  onChangeNote: (v: string) => void
  onChangeDish: (key: string, patch: Partial<OcrDishDraft>) => void
  onAddDish: () => void
  onRemoveDish: (key: string) => void
  onConfirm: () => void
  onCancel: () => void
}

function priceFor(cat: MenuCategory): number {
  if (cat === 'drink') return DRINK_PRICE
  if (cat === 'soup') return SOUP_PRICE
  return MEAL_PRICE
}

export function MenuOcrConfirm({
  preview,
  dishes,
  effectiveFrom,
  effectiveTo,
  note,
  busy,
  status,
  error,
  onChangeFrom,
  onChangeTo,
  onChangeNote,
  onChangeDish,
  onAddDish,
  onRemoveDish,
  onConfirm,
  onCancel,
}: Props) {
  const missingDay = dishes.filter((d) => d.nameZh.trim() && !d.weekday).length

  return (
    <section className="menu-ocr-confirm" aria-label="Confirm OCR dishes">
      <header className="menu-ocr-head">
        <div>
          <h3>Review dishes · 確認菜式</h3>
          <p className="form-hint">
            Each row is one dish on one weekday column (星期一–六). Same name on another day stays a separate
            row. Edit, then confirm Save — nothing is written until you confirm.
          </p>
        </div>
        <span className="menu-ocr-count">
          {dishes.length} dish{dishes.length === 1 ? '' : 'es'}
          {missingDay ? ` · ${missingDay} missing day` : ''}
        </span>
      </header>

      <div className="menu-ocr-layout">
        <div className="menu-ocr-image">
          <img src={preview} alt="Menu to confirm" />
        </div>

        <div className="menu-ocr-form">
          <div className="menu-date-row">
            <label>
              Starts (required)
              <input type="date" value={effectiveFrom} onChange={(e) => onChangeFrom(e.target.value)} disabled={busy} />
            </label>
            <label>
              Ends (optional)
              <input type="date" value={effectiveTo} onChange={(e) => onChangeTo(e.target.value)} disabled={busy} />
            </label>
          </div>
          <label>
            Note (optional)
            <input
              value={note}
              onChange={(e) => onChangeNote(e.target.value)}
              placeholder="e.g. Week of 25 Nov"
              disabled={busy}
            />
          </label>

          <ul className="menu-ocr-list">
            {dishes.length === 0 && (
              <li className="form-hint">No dishes detected — add rows manually or cancel and try a clearer photo.</li>
            )}
            {dishes.map((d) => (
              <li key={d.key}>
                <select
                  className="menu-ocr-weekday"
                  value={d.weekday ?? ''}
                  onChange={(e) =>
                    onChangeDish(d.key, {
                      weekday: (e.target.value || null) as MenuWeekday | null,
                    })
                  }
                  disabled={busy}
                  aria-label="Weekday"
                >
                  <option value="">Day…</option>
                  {MENU_WEEKDAYS.map((w) => (
                    <option key={w} value={w}>
                      {WEEKDAY_LABEL_ZH[w]}
                    </option>
                  ))}
                </select>
                <input
                  className="menu-ocr-name"
                  value={d.nameZh}
                  onChange={(e) => onChangeDish(d.key, { nameZh: e.target.value })}
                  placeholder="中文名"
                  disabled={busy}
                  aria-label="Chinese dish name"
                />
                <input
                  className="menu-ocr-en"
                  value={d.nameEn}
                  onChange={(e) => onChangeDish(d.key, { nameEn: e.target.value })}
                  placeholder="English (optional)"
                  disabled={busy}
                  aria-label="English dish name"
                />
                <select
                  value={d.category}
                  onChange={(e) => onChangeDish(d.key, { category: e.target.value as MenuCategory })}
                  disabled={busy}
                  aria-label="Category"
                >
                  <option value="meal">Meal ${MEAL_PRICE}</option>
                  <option value="soup">Soup free</option>
                  <option value="drink">Drink +${DRINK_PRICE}</option>
                </select>
                <span className="menu-ocr-price">${priceFor(d.category)}</span>
                <button type="button" className="btn-ghost" onClick={() => onRemoveDish(d.key)} disabled={busy}>
                  Remove
                </button>
              </li>
            ))}
          </ul>

          <div className="menu-photo-actions">
            <button type="button" className="btn-ghost" onClick={onAddDish} disabled={busy}>
              Add dish
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={onConfirm}
              disabled={busy || !effectiveFrom}
            >
              Confirm Save · photo + dishes
            </button>
            <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
          </div>
          {status && <p className="menu-status">{status}</p>}
          {error && <p className="menu-error">{error}</p>}
        </div>
      </div>
    </section>
  )
}
