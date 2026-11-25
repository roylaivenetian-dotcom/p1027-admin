import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import type { MenuCategory, MenuItem, MenuPhotoDoc } from '../types'
import { DRINK_PRICE, MEAL_PRICE, SOUP_PRICE } from '../lib/pricing'
import { compressMenuImage } from '../lib/menuImage'
import { todayIsoHkt } from '../lib/dates'
import { pickMenuPhotoForDate } from '../lib/menuCoverage'
import { dayBeforeIso, formatMenuRange } from '../lib/menuDates'

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
  /** Close prior open-ended menus the day before a new start (keeps history). */
  onCloseOpenEndedBefore: (newStart: string) => Promise<void>
  onDeletePhoto: (id: string) => Promise<void>
  onSaveItem: (item: MenuItem) => Promise<void>
  onDeleteItem: (id: string) => Promise<void>
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
  /** Date-range / note edit only — never used to replace history with a new upload */
  const [editingId, setEditingId] = useState<string | null>(null)

  const [nameZh, setNameZh] = useState('')
  const [category, setCategory] = useState<MenuCategory>('meal')
  const [showCaptions, setShowCaptions] = useState(false)

  const sortedPhotos = useMemo(
    () => [...photos].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)),
    [photos],
  )

  const activeToday = useMemo(() => pickMenuPhotoForDate(photos, todayIsoHkt()), [photos])

  useEffect(() => {
    void onRefresh()
  }, [onRefresh])

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    // New file always means a new menu entry (clear any date-edit mode)
    setEditingId(null)
    setError(null)
    setStatus('Compressing…')
    try {
      const { dataUrl, bytes } = await compressMenuImage(file)
      setPreview(dataUrl)
      setStatus(`New menu ready · ${Math.round(bytes / 1024)} KB — will be added (old menus kept)`)
    } catch (err) {
      setPreview(null)
      setError(err instanceof Error ? err.message : String(err))
      setStatus(null)
    }
  }

  function startEditDates(photo: MenuPhotoDoc) {
    setEditingId(photo.id)
    setEffectiveFrom(photo.effectiveFrom)
    setEffectiveTo(photo.effectiveTo ?? '')
    setNote(photo.note ?? '')
    setPreview(photo.imageDataUrl ?? photo.imageUrl)
    setError(null)
    setStatus('Editing dates / note only — photo history stays')
  }

  function resetForm() {
    setEditingId(null)
    setEffectiveFrom(todayIsoHkt())
    setEffectiveTo('')
    setNote('')
    setPreview(null)
    setStatus(null)
    setError(null)
  }

  async function saveNewPhoto() {
    if (!preview) {
      setError('Choose a menu photo first')
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
    setBusy(true)
    setError(null)
    setStatus('Adding menu (keeping previous menus)…')
    try {
      // Close any open-ended earlier menus so ranges chain cleanly; docs stay
      await onCloseOpenEndedBefore(effectiveFrom)
      await onSavePhoto({
        // Always create a new id — never overwrite another photo's image
        effectiveFrom,
        effectiveTo: end,
        imageDataUrl: preview,
        note: note.trim() || null,
      })
      await onRefresh()
      resetForm()
      setStatus('Added. Previous menus remain listed below for earlier days.')
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
      const ok = confirm(
        'This is the only menu photo. Delete it anyway? Prefer uploading a new menu with a start date instead of wiping history.',
      )
      if (!ok) return
    } else {
      const ok = confirm(
        'Remove this menu from the list? Prefer leaving it dated for earlier days. Upload a new menu to cover later days.',
      )
      if (!ok) return
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
    const price = category === 'meal' ? MEAL_PRICE : category === 'drink' ? DRINK_PRICE : SOUP_PRICE
    setBusy(true)
    try {
      await onSaveItem({
        id: `custom-${Date.now()}`,
        nameZh: nameZh.trim(),
        category,
        priceHkd: price,
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
    if (editingId || !effectiveFrom) return null
    const openPrior = photos.filter(
      (p) => !p.effectiveTo && p.effectiveFrom < effectiveFrom,
    )
    if (!openPrior.length) return null
    const until = dayBeforeIso(effectiveFrom)
    return `On save, ${openPrior.length} open-ended menu(s) will end on ${until} (kept for earlier days).`
  }, [editingId, effectiveFrom, photos])

  return (
    <section className="menu-admin">
      <header className="menu-admin-head">
        <div>
          <h2>Fixed menu · 固定菜單</h2>
          <p className="form-hint">
            Each upload is a <strong>new dated menu</strong>. Mid-week changes keep the old photo for earlier days —
            menus coexist. Grok picks the photo whose date range covers the order day. Meals HK${MEAL_PRICE} · soup
            free · drinks +HK${DRINK_PRICE}.
          </p>
        </div>
        {activeToday && (
          <span className="menu-active-pill">
            Active today · {formatMenuRange(activeToday.effectiveFrom, activeToday.effectiveTo)}
          </span>
        )}
      </header>

      <div className="menu-photo-layout">
        <div className="menu-photo-form">
          {!editingId ? (
            <>
              <label className="menu-file-label">
                <span>Upload new menu photo</span>
                <input type="file" accept="image/*" onChange={onFile} disabled={busy} />
              </label>
              <div className="menu-date-row">
                <label>
                  Starts (required)
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
              <p className="form-hint">
                Leave end empty for open-ended. Previous menus stay listed for cross-reference.
              </p>
              {willCloseHint && <p className="menu-status">{willCloseHint}</p>}
              <label>
                Note (optional)
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Week of 25 Nov"
                  disabled={busy}
                />
              </label>
              <div className="menu-photo-actions">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => void saveNewPhoto()}
                  disabled={busy || !preview}
                >
                  Add menu (keep history)
                </button>
              </div>
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
            </>
          )}
          {status && <p className="menu-status">{status}</p>}
          {error && <p className="menu-error">{error}</p>}
        </div>

        <div className="menu-photo-preview">
          {preview ? (
            <img src={preview} alt="Menu preview" />
          ) : (
            <div className="menu-photo-empty">No new photo selected</div>
          )}
        </div>
      </div>

      <h3 className="menu-section-title">All menus (by start date) · cross-reference</h3>
      <p className="form-hint">
        {sortedPhotos.length} menu{sortedPhotos.length === 1 ? '' : 's'} stored. Older entries remain so past orders
        still match the correct photo.
      </p>
      <ul className="menu-photo-list">
        {sortedPhotos.length === 0 && <li className="form-hint">No menu photos yet — upload the first set menu.</li>}
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
        {showCaptions ? 'Hide' : 'Show'} optional dish captions (text hints)
      </button>

      {showCaptions && (
        <div className="menu-captions">
          <p className="form-hint">
            Optional aliases in <code>menuItems</code>. Primary matching is the dated photo in{' '}
            <code>menuPhotos</code>.
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
                  <strong>{m.nameZh}</strong> · {m.category} · ${m.priceHkd}
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
