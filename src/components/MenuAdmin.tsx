import { useState } from 'react'
import type { MenuCategory, MenuItem } from '../types'
import { DRINK_PRICE, MEAL_PRICE, SOUP_PRICE } from '../lib/pricing'

interface Props {
  menu: MenuItem[]
  onSave: (menu: MenuItem[]) => void
}

export function MenuAdmin({ menu, onSave }: Props) {
  const [draft, setDraft] = useState<MenuItem[]>(menu)
  const [nameZh, setNameZh] = useState('')
  const [category, setCategory] = useState<MenuCategory>('meal')

  function addItem() {
    if (!nameZh.trim()) return
    const price = category === 'meal' ? MEAL_PRICE : category === 'drink' ? DRINK_PRICE : SOUP_PRICE
    const item: MenuItem = {
      id: `custom-${Date.now()}`,
      nameZh: nameZh.trim(),
      category,
      priceHkd: price,
      active: true,
    }
    const next = [...draft, item]
    setDraft(next)
    onSave(next)
    setNameZh('')
  }

  function toggle(id: string) {
    const next = draft.map((m) => (m.id === id ? { ...m, active: !m.active } : m))
    setDraft(next)
    onSave(next)
  }

  function remove(id: string) {
    const next = draft.filter((m) => m.id !== id)
    setDraft(next)
    onSave(next)
  }

  return (
    <section className="menu-admin">
      <h2>Fixed menu · 固定菜單</h2>
      <p className="form-hint">
        Meals HK${MEAL_PRICE} · soup free · drinks +HK${DRINK_PRICE}. Off-menu WhatsApp lines become 未計價.
      </p>
      <div className="menu-add">
        <input value={nameZh} onChange={(e) => setNameZh(e.target.value)} placeholder="Dish name (中文)" />
        <select value={category} onChange={(e) => setCategory(e.target.value as MenuCategory)}>
          <option value="meal">Meal</option>
          <option value="soup">Soup</option>
          <option value="drink">Drink</option>
        </select>
        <button type="button" className="btn-primary" onClick={addItem}>
          Add
        </button>
      </div>
      <ul className="menu-list">
        {draft.map((m) => (
          <li key={m.id} className={!m.active ? 'inactive' : undefined}>
            <span>
              <strong>{m.nameZh}</strong>
              {m.nameEn ? ` · ${m.nameEn}` : ''} · {m.category} · ${m.priceHkd}
            </span>
            <span className="menu-actions">
              <button type="button" className="btn-ghost" onClick={() => toggle(m.id)}>
                {m.active ? 'Disable' : 'Enable'}
              </button>
              <button type="button" className="btn-ghost" onClick={() => remove(m.id)}>
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
