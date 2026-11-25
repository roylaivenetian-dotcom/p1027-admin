import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent } from 'react'
import type { MenuCategory, MenuItem, MenuPhotoDoc } from '../types'
import { DRINK_PRICE, MEAL_PRICE, SOUP_PRICE } from '../lib/pricing'
import { compressMenuImage } from '../lib/menuImage'
import { todayIsoHkt } from '../lib/dates'
import { pickMenuPhotoForDate } from '../lib/menuCoverage'
import { dayBeforeIso, formatMenuRange } from '../lib/menuDates'
import { ocrMenuImage, slugMenuItemId, type OcrDishDraft } from '../lib/menuOcr'
import { MenuOcrConfirm } from './MenuOcrConfirm'

interface Props {
  menu: MenuItem[]
  photos: MenuPhotoDoc[]
  onRefresh: () => Promise<void>
  onSavePhoto: (input: {
    id?: string
    effectiveFrom: string
    effectiveTo: string | null
    imageDataUrl: string
    note?: string | null
  }) => Promise<void>
  onCloseOpenEndedBefore: (newStart: string) => Promise<void>
  onDeletePhoto: (id: string) => Promise<void>
  onSaveItem: (item: MenuItem) => Promise<void>
  onDeleteItem: (id: string) => Promise<void>
}

type Step = 'idle' | 'confirm' | 'edit-dates'

function priceFor(cat: MenuCategory): number {
  if (cat === 'drink') return DRINK_PRICE
  if (cat === 'soup') return SOUP_PRICE
  return MEAL_PRICE
}

export function MenuAdmin({
  menu,
  photos,
  onRefresh,
  onSavePhoto,
  onCloseOpenEndedBefore,
  onDeletePhoto,
  onSaveItem,
  onDeleteItem,
}: Props) {
  const [effectiveFrom, setEffectiveFrom] = useState(todayIsoHkt())
  const [effectiveTo, setEffectiveTo] = useState('')
  const [note, setNote] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('idle')
  const [ocrDishes, setOcrDishes] = useState<OcrDishDraft[]>([])
  const [pasteFocus, setPasteFocus] = useState(false)

  const [nameZh, setNameZh] = useState('')
  const [category, setCategory] = useState<MenuCategory>('meal')
  const [showCaptions, setShowCaptions] = useState(false)
  const pasteRef = useRef<HTMLDivElement>(null)

  const sortedPhotos = useMemo(
    () => [...photos].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
    [photos],
  )
  const activeToday = useMemo(() => pickMenuPhotoForDate(photos, todayIsoHkt()), [photos])

  useEffect(() => {
    void onRefresh()
  }, [onRefresh])

  const resetForm = useCallback(() => {
    setEditingId(null)
    setEffectiveFrom(todayIsoHkt())
    setEffectiveTo('')
    setNote('')
    setPreview(null)
    setStatus(null)
    setError(null)
    setStep('idle')
    setOcrDishes([])
  }, [])

  const ingestImageFile = useCallback(async (file: File) => {
    setEditingId(null)
    setError(null)
    setStep('idle')
    setOcrDishes([])
    setBusy(true)
    setStatus('Compressing…')
    try {
      const { dataUrl, bytes } = await compressMenuImage(file)
      setPreview(dataUrl)
      setStatus(`OCR… (${Math.round(bytes / 1024)} KB)`)
      const { dishes } = await ocrMenuImage(dataUrl, (msg) => setStatus(msg))
      setOcrDishes(
        dishes.length
          ? dishes
          : [
              {
                key: `blank-${Date.now()}`,
                nameZh: '',
                nameEn: '',
                category: 'meal',
              },
            ],
      )
      setStep('confirm')
      setStatus(
        dishes.length
          ? `Review ${dishes.length} dish${dishes.length === 1 ? '' : 'es'} — confirm before save`
          : 'OCR found no dishes — add rows manually, then confirm',
      )
    } catch (err) {
      setPreview(null)
      setStep('idle')
      setError(err instanceof Error ? err.message : String(err))
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }, [])

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await ingestImageFile(file)
  }

  function onPaste(e: ClipboardEvent) {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) void ingestImageFile(file)
        return
      }
    }
  }

  function startEditDates(photo: MenuPhotoDoc) {
    setEditingId(photo.id)
    setEffectiveFrom(photo.effectiveFrom)
    setEffectiveTo(photo.effectiveTo ?? '')
    setNote(photo.note ?? '')
    setPreview(photo.imageDataUrl ?? photo.imageUrl)
    setStep('edit-dates')
    setOcrDishes([])
    setError(null)
    setStatus('Editing dates / note only — photo history stays')
  }

  async function confirmSave() {
    if (!preview) {
      setError('Missing menu photo')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      setError('Start date is required (YYYY-MM-DD)')
      return
    }
    const end = effectiveTo.trim() || null
    if (end && end < effectiveFrom) {
      setError('End date must be on or after the start date')
      return
    }
    const cleaned = ocrDishes
      .map((d) => ({
        ...d,
        nameZh: d.nameZh.trim(),
        nameEn: d.nameEn.trim(),
      }))
      .filter((d) => d.nameZh.length >= 1)

    setBusy(true)
    setError(null)
    setStatus('Saving photo + dish captions…')
    try {
      await onCloseOpenEndedBefore(effectiveFrom)
      await onSavePhoto({
        effectiveFrom,
        effectiveTo: end,
        imageDataUrl: preview,
        note: note.trim() || null,
      })
      for (const d of cleaned) {
        await onSaveItem({
          id: slugMenuItemId(d.nameZh),
          nameZh: d.nameZh,
          nameEn: d.nameEn || undefined,
          category: d.category,
          priceHkd: priceFor(d.category),
          active: true,
        })
      }
      await onRefresh()
      const n = cleaned.length
      resetForm()
      setStatus(
        `Saved menu photo + ${n} caption${n === 1 ? '' : 's'}. Previous menus remain for earlier days.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStatus(null)
    } finally {
      setBusy(false)
    }
  }

  async function saveDateEdit() {
    if (!editingId) return
    const existing = photos.find((p) => p.id === editingId)
    if (!existing?.imageDataUrl && !existing?.imageUrl) {
      setError('Missing photo data')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
      setError('Start date is required')
      return
    }
    const end = effectiveTo.trim() || null
    if (end && end < effectiveFrom) {
      setError('End date must be on or after the start date')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await onSavePhoto({
        id: editingId,
        effectiveFrom,
        effectiveTo: end,
        imageDataUrl: existing.imageDataUrl || existing.imageUrl || '',
        note: note.trim() || null,
      })
      await onRefresh()
      resetForm()
      setStatus('Dates updated — all menus still listed')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function removePhoto(id: string) {
    if (photos.length <= 1) {
      if (
        !confirm(
          'This is the only menu photo. Delete it anyway? Prefer uploading a new menu with a start date instead of wiping history.',
        )
      ) {
        return
      }
    } else if (
      !confirm(
        'Remove this menu from the list? Prefer leaving it dated for earlier days. Upload a new menu to cover later days.',
      )
    ) {
      return
    }
    setBusy(true)
    try {
      await onDeletePhoto(id)
      await onRefresh()
      if (editingId === id) resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  async function addCaption() {
    if (!nameZh.trim()) return
    setBusy(true)
    try {
      await onSaveItem({
        id: slugMenuItemId(nameZh.trim()),
        nameZh: nameZh.trim(),
        category,
        priceHkd: priceFor(category),
        active: true,
      })
      setNameZh('')
      await onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const willCloseHint = useMemo(() => {
    if (step === 'edit-dates' || !effectiveFrom) return null
    const openPrior = photos.filter((p) => !p.effectiveTo && p.effectiveFrom < effectiveFrom)
    if (!openPrior.length) return null
    return `On confirm, ${openPrior.length} open-ended menu(s) will end on ${dayBeforeIso(effectiveFrom)} (kept for earlier days).`
  }, [step, effectiveFrom, photos])

  return (
    <section className="menu-admin" onPaste={onPaste}>
      <header className="menu-admin-head">
        <div>
          <h2>Fixed menu · 固定菜單</h2>
          <p className="form-hint">
            Paste or upload a menu <strong>photo</strong> → OCR extracts dishes → review / edit → confirm Save. Mid-week
            uploads keep older menus for earlier days. Meals HK${MEAL_PRICE} · soup free · drinks +HK${DRINK_PRICE}.
          </p>
        </div>
        {activeToday && (
          <span className="menu-active-pill">
            Active today · {formatMenuRange(activeToday.effectiveFrom, activeToday.effectiveTo)}
          </span>
        )}
      </header>

      {step === 'confirm' && preview ? (
        <>
          {willCloseHint && <p className="menu-status">{willCloseHint}</p>}
          <MenuOcrConfirm
            preview={preview}
            dishes={ocrDishes}
            effectiveFrom={effectiveFrom}
            effectiveTo={effectiveTo}
            note={note}
            busy={busy}
            status={status}
            error={error}
            onChangeFrom={setEffectiveFrom}
            onChangeTo={setEffectiveTo}
            onChangeNote={setNote}
            onChangeDish={(key, patch) =>
              setOcrDishes((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
            }
            onAddDish={() =>
              setOcrDishes((rows) => [
                ...rows,
                { key: `manual-${Date.now()}`, nameZh: '', nameEn: '', category: 'meal' },
              ])
            }
            onRemoveDish={(key) => setOcrDishes((rows) => rows.filter((r) => r.key !== key))}
            onConfirm={() => void confirmSave()}
            onCancel={resetForm}
          />
        </>
      ) : (
        <div className="menu-photo-layout">
          <div className="menu-photo-form">
            {step !== 'edit-dates' ? (
              <>
                <div
                  ref={pasteRef}
                  className={`menu-paste-zone${pasteFocus ? ' focused' : ''}${busy ? ' busy' : ''}`}
                  tabIndex={0}
                  onFocus={() => setPasteFocus(true)}
                  onBlur={() => setPasteFocus(false)}
                  onPaste={onPaste}
                  role="button"
                  aria-label="Paste menu photo"
                >
                  <strong>Paste menu photo here</strong>
                  <span className="form-hint">Ctrl/Cmd+V · or choose a file below. OCR runs before save.</span>
                </div>
                <label className="menu-file-label">
                  <span>Or upload file</span>
                  <input type="file" accept="image/*" onChange={(e) => void onFile(e)} disabled={busy} />
                </label>
                {status && <p className="menu-status">{status}</p>}
                {error && <p className="menu-error">{error}</p>}
              </>
            ) : (
              <>
                <p className="menu-status">Adjust dates / note for this entry. Image is not replaced.</p>
                <div className="menu-date-row">
                  <label>
                    Starts
                    <input
                      type="date"
                      value={effectiveFrom}
                      onChange={(e) => setEffectiveFrom(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                  <label>
                    Ends (optional)
                    <input
                      type="date"
                      value={effectiveTo}
                      onChange={(e) => setEffectiveTo(e.target.value)}
                      disabled={busy}
                    />
                  </label>
                </div>
                <label>
                  Note
                  <input value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} />
                </label>
                <div className="menu-photo-actions">
                  <button type="button" className="btn-primary" onClick={() => void saveDateEdit()} disabled={busy}>
                    Save dates
                  </button>
                  <button type="button" className="btn-ghost" onClick={resetForm} disabled={busy}>
                    Cancel
                  </button>
                </div>
                {status && <p className="menu-status">{status}</p>}
                {error && <p className="menu-error">{error}</p>}
              </>
            )}
          </div>

          <div className="menu-photo-preview">
            {preview && step === 'edit-dates' ? (
              <img src={preview} alt="Menu preview" />
            ) : (
              <div className="menu-photo-empty">
                {busy ? 'Working…' : 'Paste or upload a menu photo to start OCR'}
              </div>
            )}
          </div>
        </div>
      )}

      <h3 className="menu-section-title">All menus (by start date) · cross-reference</h3>
      <p className="form-hint">
        {sortedPhotos.length} menu{sortedPhotos.length === 1 ? '' : 's'} stored. Older entries remain so past orders
        still match the correct photo.
      </p>
      <ul className="menu-photo-list">
        {sortedPhotos.length === 0 && <li className="form-hint">No menu photos yet — paste or upload the first set menu.</li>}
        {sortedPhotos.map((p) => {
          const src = p.imageDataUrl || p.imageUrl
          const isActive = activeToday?.id === p.id
          return (
            <li key={p.id} className={isActive ? 'menu-photo-active' : undefined}>
              <div className="menu-photo-thumb">{src ? <img src={src} alt="" /> : <span>—</span>}</div>
              <div className="menu-photo-meta">
                <strong>{formatMenuRange(p.effectiveFrom, p.effectiveTo)}</strong>
                {isActive && <span className="menu-active-tag">covers today</span>}
                {p.note && <span className="form-hint">{p.note}</span>}
                <span className="form-hint">id {p.id}</span>
              </div>
              <span className="menu-actions">
                <button type="button" className="btn-ghost" onClick={() => startEditDates(p)} disabled={busy}>
                  Edit dates
                </button>
                <button type="button" className="btn-ghost" onClick={() => void removePhoto(p.id)} disabled={busy}>
                  Remove
                </button>
              </span>
            </li>
          )
        })}
      </ul>

      <button type="button" className="btn-ghost menu-captions-toggle" onClick={() => setShowCaptions((v) => !v)}>
        {showCaptions ? 'Hide' : 'Show'} saved dish captions (menuItems)
      </button>

      {showCaptions && (
        <div className="menu-captions">
          <p className="form-hint">
            Text captions from OCR confirm (and manual adds). Primary matching is still the dated photo.
          </p>
          <div className="menu-add">
            <input
              value={nameZh}
              onChange={(e) => setNameZh(e.target.value)}
              placeholder="Dish name (中文)"
              disabled={busy}
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as MenuCategory)}
              disabled={busy}
            >
              <option value="meal">Meal</option>
              <option value="soup">Soup</option>
              <option value="drink">Drink</option>
            </select>
            <button type="button" className="btn-primary" onClick={() => void addCaption()} disabled={busy}>
              Add caption
            </button>
          </div>
          <ul className="menu-list">
            {menu.map((m) => (
              <li key={m.id} className={!m.active ? 'inactive' : undefined}>
                <span>
                  <strong>{m.nameZh}</strong>
                  {m.nameEn ? ` · ${m.nameEn}` : ''} · {m.category} · ${m.priceHkd}
                </span>
                <span className="menu-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={busy}
                    onClick={() => void onDeleteItem(m.id).then(() => onRefresh())}
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
