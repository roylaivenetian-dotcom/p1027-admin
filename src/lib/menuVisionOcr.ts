import type { MenuCategory } from '../types'
import type { OcrDishDraft } from './menuOcrParse'

export type VisionProgress = (msg: string) => void

const DEFAULT_MODELS = [
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.8-flash',
  'gemini-2.5-flash',
]

function getApiKey(): string | null {
  const dedicated = import.meta.env.VITE_GEMINI_API_KEY as string | undefined
  if (dedicated && !dedicated.includes('YOUR_') && dedicated.length > 20) return dedicated
  // Firebase web API key works for Generative Language when enabled on the project
  const fb = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined
  if (fb && !fb.includes('YOUR_') && fb.length > 20) return fb
  return null
}

function getModels(): string[] {
  const preferred = import.meta.env.VITE_GEMINI_MODEL as string | undefined
  if (preferred?.trim()) return [preferred.trim(), ...DEFAULT_MODELS.filter((m) => m !== preferred.trim())]
  return DEFAULT_MODELS
}

const PROMPT = `你是香港茶餐廳每週午膳菜單閱讀助手。圖片通常是「鴻運美德小館」風格：星期一至星期六六欄，每欄編號 1–9 的中文飯菜。

只輸出 JSON（不要 markdown code fence）：
{"dishes":[{"nameZh":"中文菜名","nameEn":"","category":"meal"}]}

規則：
1. 每一道真正的菜一個物件；不要把不同欄/日子的菜黏在一起。
2. 去掉編號（1. 2.）與價錢符號。
3. nameEn 一律空字串，除非菜單上清楚印了英文菜名（不要亂猜、不要輸出 OCR 雜訊英文）。
4. 忽略店名、電話、外賣說明、表格線、星期標題（星期一…星期六）。
5. category 只能是 meal / soup / drink（飯/麵/粉類=meal）。
6. 同一菜名（例如每日都有的「燒味飯」「經典豉油西餐飯」）只列一次。
7. 盡量列出整週所有不同菜式。`

function normalizeCategory(c: unknown): MenuCategory {
  const s = String(c ?? 'meal').toLowerCase()
  if (s === 'soup' || s === 'drink' || s === 'meal') return s
  return 'meal'
}

function looksLikeDish(name: string): boolean {
  if (!/[\u3400-\u9fff]/.test(name)) return false
  if (name.length < 2 || name.length > 40) return false
  if (/星期[一二三四五六日天]/.test(name)) return false
  if (/^[—–\-_=]{2,}$/.test(name)) return false
  return true
}

function parseVisionJson(raw: string): OcrDishDraft[] {
  let text = raw.trim()
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  }
  let data: { dishes?: unknown[] }
  try {
    data = JSON.parse(text)
  } catch {
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return []
    data = JSON.parse(m[0])
  }
  const out: OcrDishDraft[] = []
  const seen = new Set<string>()
  for (const row of data.dishes ?? []) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const nameZh = String(r.nameZh ?? r.name ?? '')
      .replace(/^\d+\s*[.．、\)]\s*/, '')
      .replace(/\s+/g, '')
      .trim()
    if (!looksLikeDish(nameZh) || seen.has(nameZh)) continue
    seen.add(nameZh)
    const nameEnRaw = String(r.nameEn ?? '').trim()
    const nameEn =
      nameEnRaw && /^[A-Za-z][A-Za-z\s\-']{2,40}$/.test(nameEnRaw) && !/[=&\/\\]/.test(nameEnRaw)
        ? nameEnRaw
        : ''
    out.push({
      key: `vision-${out.length}-${Date.now()}`,
      nameZh,
      nameEn,
      category: normalizeCategory(r.category),
    })
  }
  return out
}

async function dataUrlToBase64(dataUrl: string): Promise<{ mime: string; data: string }> {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (m) return { mime: m[1]!, data: m[2]! }
  // fetch blob url / http
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  const buf = await blob.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return { mime: blob.type || 'image/jpeg', data: btoa(binary) }
}

/** Downscale for vision API (keeps enough detail for weekly grids). */
export async function prepareVisionImage(dataUrl: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Vision image load failed'))
    el.src = dataUrl
  })
  const maxW = 1400
  const scale = Math.min(1, maxW / img.width)
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.88)
}

export function visionConfigured(): boolean {
  return Boolean(getApiKey())
}

/**
 * Primary path: Gemini vision reads the weekly Chinese lunch grid.
 * Uses Firebase web API key / optional VITE_GEMINI_API_KEY (Spark-friendly, no Cloud Functions).
 */
export async function visionExtractDishes(
  imageDataUrl: string,
  onProgress?: VisionProgress,
): Promise<{ text: string; dishes: OcrDishDraft[] }> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('No Gemini/Firebase API key for vision OCR')

  onProgress?.('Preparing image for vision…')
  const prepared = await prepareVisionImage(imageDataUrl)
  const { mime, data } = await dataUrlToBase64(prepared)

  const models = getModels()
  let lastErr: Error | null = null

  for (const model of models) {
    onProgress?.(`Vision reading menu (${model})…`)
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: PROMPT },
                  { inline_data: { mime_type: mime, data } },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json',
            },
          }),
        },
      )
      const raw = await res.text()
      if (!res.ok) {
        let msg = raw.slice(0, 200)
        try {
          msg = JSON.parse(raw).error?.message ?? msg
        } catch {
          /* keep */
        }
        // try next model on 404/503
        if (res.status === 404 || res.status === 503) {
          lastErr = new Error(`${model}: ${msg}`)
          continue
        }
        throw new Error(`Vision API ${res.status}: ${msg}`)
      }
      const json = JSON.parse(raw) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[]
      }
      const text =
        json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
      const dishes = parseVisionJson(text)
      if (!dishes.length) {
        lastErr = new Error(`${model} returned no dishes`)
        continue
      }
      onProgress?.(`Vision found ${dishes.length} dishes — review before save`)
      return { text, dishes }
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e))
    }
  }

  throw lastErr ?? new Error('Vision OCR failed')
}
