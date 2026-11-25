import { createWorker, type Worker } from 'tesseract.js'
import type { MenuCategory } from '../types'

export type OcrDishDraft = {
  key: string
  nameZh: string
  nameEn: string
  category: MenuCategory
}

let workerPromise: Promise<Worker> | null = null

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      // Traditional + Simplified Chinese + English for HK menus
      const worker = await createWorker(['chi_tra', 'chi_sim', 'eng'], 1, {
        logger: () => {
          /* progress surfaced by caller via status string */
        },
      })
      await worker.setParameters({
        preserve_interword_spaces: '1',
      })
      return worker
    })()
  }
  return workerPromise
}

const PRICE_RE = /\$?\s*\d{1,3}(?:\.\d{1,2})?/g
const NOISE_RE =
  /^(菜單|午餐|晚餐|本日|今日午餐|今日|星期|週|周|soup|drink|menu|set|meal|p1027|admin|免費|例湯|飲品|備註|note|free)/i

function stripNoise(line: string): string {
  return line
    .replace(PRICE_RE, ' ')
    .replace(/[|｜•·、,，.。:：;；()（）\[\]【】]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function hasCjk(s: string): boolean {
  return /[\u3400-\u9fff]/.test(s)
}

function guessCategory(name: string): MenuCategory {
  const n = name.toLowerCase()
  if (/湯|soup/.test(n) && !/飯|麵|面|粉/.test(n)) return 'soup'
  if (/茶|可樂|汽水|咖啡|汁|drink|檸/.test(n) && !/飯|麵|面/.test(n)) return 'drink'
  return 'meal'
}

function splitEnZh(raw: string): { nameZh: string; nameEn: string } {
  const cleaned = stripNoise(raw)
  // "Tomato egg rice 番茄炒蛋飯" or "番茄炒蛋飯 Tomato"
  const cjkParts = cleaned.match(/[\u3400-\u9fff][\u3400-\u9fff\s]*/g)
  const nameZh = (cjkParts?.join('') ?? cleaned).replace(/\s+/g, '').trim()
  let nameEn = cleaned
    .replace(/[\u3400-\u9fff]+/g, ' ')
    .replace(/[+\-–—]/g, ' ')
    .replace(/\bP\d+\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (nameEn.length <= 1) nameEn = ''
  return { nameZh: nameZh || cleaned, nameEn }
}

/** Parse OCR plain text into editable dish drafts. */
export function parseOcrDishLines(text: string): OcrDishDraft[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const out: OcrDishDraft[] = []
  const seen = new Set<string>()

  for (const line of lines) {
    const cleaned = stripNoise(line)
    if (cleaned.length < 2) continue
    if (NOISE_RE.test(cleaned)) continue
    if (!hasCjk(cleaned) && cleaned.length < 4) continue
    // Skip pure numbers / short junk
    if (/^[\d\s.]+$/.test(cleaned)) continue

    const { nameZh, nameEn } = splitEnZh(cleaned)
    if (nameZh.length < 2) continue
    const key = nameZh.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    out.push({
      key: `ocr-${out.length}-${Date.now()}`,
      nameZh,
      nameEn,
      category: guessCategory(nameZh + nameEn),
    })
  }

  return out
}

export type OcrProgress = (msg: string) => void

/** Run Tesseract on a data URL / blob URL; return drafts (may be empty). */
export async function ocrMenuImage(
  image: string | HTMLImageElement | File | Blob,
  onProgress?: OcrProgress,
): Promise<{ text: string; dishes: OcrDishDraft[] }> {
  onProgress?.('Loading OCR (Chinese)…')
  const worker = await getWorker()
  onProgress?.('Reading menu photo…')
  const result = await worker.recognize(image)
  const text = result.data.text ?? ''
  onProgress?.('Parsing dishes…')
  const dishes = parseOcrDishLines(text)
  return { text, dishes }
}

export function slugMenuItemId(nameZh: string): string {
  const base = nameZh
    .trim()
    .replace(/\s+/g, '')
    .slice(0, 40)
  return `cap_${base || 'item'}_${Math.abs(hash(nameZh))}`
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}
