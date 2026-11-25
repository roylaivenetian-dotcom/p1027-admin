import type { MenuCategory } from '../types'
import { normalizeMenuWeekday, type MenuWeekday } from './menuWeekday'

export type OcrDishDraft = {
  key: string
  nameZh: string
  nameEn: string
  category: MenuCategory
  /** Weekly grid column; required for day-accurate pricing */
  weekday: MenuWeekday | null
}

const DISH_END = /(?:飯|麵|面|粉|粥|河|米|粉麵)(?:\([^)]{0,40}\))?$/
const NUMBERED_RE = /(?:^|\n)\s*(\d{1,2})\s*[.．、\)]\s*([^\n\d]+?)(?=(?:\n\s*\d{1,2}\s*[.．、\)])|$)/g
const DISH_TOKEN_RE =
  /[\u3400-\u9fff][\u3400-\u9fffA-Za-z0-9/／()（）]{1,28}(?:飯|麵|面|粉|粥)(?:\([^)]{0,40}\))?/g

const HEADER_NOISE =
  /星期[一二三四五六日天]|鴻運|美德|小館|午餐|晚餐|咖啡|奶茶|可樂|汽水|外賣|電話|地址|備註|免費|例湯|飲品|menu|soup|drink|free|p1027/i

const GARBAGE_LATIN = /^[^a-zA-Z]*$|[=&\/\\|<>]{2,}|\b(ET|XO|TRN|XOR|AXORL)\b/i

function hasCjk(s: string): boolean {
  return /[\u3400-\u9fff]/.test(s)
}

function cjkOnlyRatio(s: string): number {
  const cjk = (s.match(/[\u3400-\u9fff]/g) ?? []).length
  const letters = (s.match(/[A-Za-z]/g) ?? []).length
  return cjk / Math.max(1, cjk + letters)
}

function cleanDishName(raw: string): string {
  return raw
    .replace(/^\d+\s*[.．、\)]\s*/, '')
    .replace(/[|｜•·、,，.。:：;；\[\]【】«»""''`~_]/g, '')
    .replace(/[—–\-_=]{2,}/g, '')
    .replace(/\s+/g, '')
    .replace(/^[一二三四五六日天]+/, '') // stray day fragments glued on
    .trim()
}

function looksLikeDish(name: string): boolean {
  if (!hasCjk(name)) return false
  if (name.length < 3 || name.length > 36) return false
  if (HEADER_NOISE.test(name) && name.length < 8) return false
  if (/^[—–\-_=丨|]{2,}$/.test(name)) return false
  // Prefer rice/noodles endings; allow a few others with 炒/炆/煮
  if (DISH_END.test(name)) return true
  if (/[\u3400-\u9fff]{4,}/.test(name) && /[炒炆煮燒炸焗扒]/.test(name)) return true
  return false
}

function guessCategory(name: string): MenuCategory {
  if (/湯/.test(name) && !/飯|麵|面|粉/.test(name)) return 'soup'
  if (/茶|可樂|汽水|咖啡|汁|奶茶/.test(name) && !/飯|麵|面/.test(name)) return 'drink'
  return 'meal'
}

/** English only when the fragment is clearly Latin dish text — never OCR junk. */
export function extractClearEnglish(raw: string): string {
  const latin = raw
    .replace(/[\u3400-\u9fff0-9$￥.．、，,()（）/／+\-—–]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (latin.length < 3) return ''
  if (GARBAGE_LATIN.test(latin)) return ''
  if (!/^[A-Za-z][A-Za-z\s\-']{2,40}$/.test(latin)) return ''
  if (cjkOnlyRatio(raw) > 0.5 && latin.length < 6) return ''
  return latin
}

/** Split one day-cell OCR text into dish drafts. */
export function parseDayCellText(text: string, keyPrefix: string): OcrDishDraft[] {
  const normalized = text.replace(/\r/g, '\n')
  const found: string[] = []

  // 1) Numbered list items (preferred)
  NUMBERED_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = NUMBERED_RE.exec(normalized))) {
    const name = cleanDishName(m[2] ?? '')
    if (looksLikeDish(name)) found.push(name)
  }

  // 2) Fallback: tokens ending in 飯 / 麵 …
  if (found.length < 3) {
    const tokens = normalized.match(DISH_TOKEN_RE) ?? []
    for (const t of tokens) {
      const name = cleanDishName(t)
      if (looksLikeDish(name)) found.push(name)
    }
  }

  const weekday = normalizeMenuWeekday(keyPrefix)
  const out: OcrDishDraft[] = []
  const seen = new Set<string>()
  for (const nameZh of found) {
    const dedupe = `${weekday ?? ''}:${nameZh}`
    if (seen.has(dedupe)) continue
    seen.add(dedupe)
    out.push({
      key: `${keyPrefix}-${out.length}`,
      nameZh,
      nameEn: '', // never invent English from OCR noise
      category: guessCategory(nameZh),
      weekday,
    })
  }
  return out
}

/** Merge day cells; unique per weekday + name. */
export function mergeDishDrafts(groups: OcrDishDraft[][]): OcrDishDraft[] {
  const out: OcrDishDraft[] = []
  const seen = new Set<string>()
  for (const group of groups) {
    for (const d of group) {
      const k = `${d.weekday ?? ''}:${d.nameZh}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ ...d, key: `ocr-${out.length}-${Date.now()}` })
    }
  }
  return out
}

/** Legacy full-page parse (weaker); still prefers numbered + 飯 endings, no junk English. */
export function parseOcrDishLines(text: string): OcrDishDraft[] {
  return parseDayCellText(text, 'full')
}
