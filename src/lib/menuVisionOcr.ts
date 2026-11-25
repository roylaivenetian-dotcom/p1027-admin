import type { MenuCategory } from '../types'
import type { OcrDishDraft } from './menuOcrParse'

export type VisionProgress = (msg: string) => void

const DEFAULT_MODELS = [
  'gemini-3.5-flash',
  'gemini-3.8-flash',
  'gemini-flash-latest',
  'gemini-3.5-flash-lite',
]

function getApiKeys(): string[] {
  const keys: string[] = []
  const dedicated = import.meta.env.VITE_GEMINI_API_KEY as string | undefined
  if (dedicated && !dedicated.includes('YOUR_') && dedicated.length > 20) keys.push(dedicated)
  const fb = import.meta.env.VITE_FIREBASE_API_KEY as string | undefined
  if (fb && !fb.includes('YOUR_') && fb.length > 20 && !keys.includes(fb)) keys.push(fb)
  return keys
}

function getApiKey(): string | null {
  return getApiKeys()[0] ?? null
}

function getModels(): string[] {
  const preferred = import.meta.env.VITE_GEMINI_MODEL as string | undefined
  if (preferred?.trim()) return [preferred.trim(), ...DEFAULT_MODELS.filter((m) => m !== preferred.trim())]
  return DEFAULT_MODELS
}

const PROMPT = `你是香港繁體中文菜單逐字抄寫員（不是簡體翻譯器、不是同音猜字）。任務：從每週午膳菜單照片準確抄出每道菜的繁體中文菜名。

圖片通常是「鴻運美德小館」風格：星期一至星期六六欄，每欄編號 1–9。

只輸出 JSON（不要 markdown code fence）：
{"dishes":[{"nameZh":"繁體中文菜名","nameEn":"","category":"meal"}]}

嚴格規則：
1. 必須用「繁體中文」字形。不要簡化、不要用同音/近形字代替。
2. 逐字對照照片筆畫；不確定就再看清楚，不要發明常見錯字。
3. 常見易錯字（必須按照片正確字，以下為提醒）：
   - 韭菜／韭菜花（绝不是「九菜」）
   - 芥蘭（绝不是「介蘭」）
   - 蘿蔔（绝不是「羅白／羅蔔」）
   - 炆、豉、燒、炒、炸、焗、扒、腩、鯪、魷
   - 豆卜、豬手、豬頸肉、涼瓜、椰汁、香芋
4. 一菜一列；勿把相鄰日子欄位黏在一起。去掉 1. 2. 編號與價錢。
5. nameEn 一律 ""（除非照片清楚印了英文；不要亂猜英文）。
6. 忽略店名、電話、外賣說明、星期標題、表格線。
7. 同名菜（如每日「燒味飯」「經典豉油西餐飯…」）只列一次。
8. category 只能是 meal / soup / drink（飯麵粉類=meal）。`

const TRAD_FIXES: [RegExp, string][] = [
  [/九菜花/g, '韭菜花'],
  [/九菜/g, '韭菜'],
  [/介蘭/g, '芥蘭'],
  [/羅白/g, '蘿蔔'],
  [/羅蔔/g, '蘿蔔'],
  [/椒汁香芋/g, '椰汁香芋'],
]

function applyTradFixes(name: string): string {
  let s = name
  for (const [re, to] of TRAD_FIXES) s = s.replace(re, to)
  return s
}

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
    let nameZh = String(r.nameZh ?? r.name ?? '')
      .replace(/^\d+\s*[.．、\)]\s*/, '')
      .replace(/\s+/g, '')
      .trim()
    nameZh = applyTradFixes(nameZh)
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
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  const buf = await blob.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  return { mime: blob.type || 'image/jpeg', data: btoa(binary) }
}

/** Prepare a JPEG for Gemini: enough pixels for 繁體 strokes, but capped for request size. */
export async function prepareVisionImage(dataUrl: string, targetW = 1600): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Vision image load failed'))
    el.src = dataUrl
  })
  // Upscale only if small (<1200); otherwise downscale/keep near targetW
  let w: number
  if (img.width < 1200) w = Math.min(targetW, Math.round(img.width * (targetW / Math.max(img.width, 1))))
  else w = Math.min(targetW, img.width)
  w = Math.max(800, w)
  const h = Math.round((img.height / img.width) * w)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)

  try {
    const blur = document.createElement('canvas')
    blur.width = w
    blur.height = h
    const bctx = blur.getContext('2d')
    if (bctx) {
      bctx.filter = 'blur(0.5px)'
      bctx.drawImage(canvas, 0, 0)
      const sharp = ctx.getImageData(0, 0, w, h)
      const soft = bctx.getImageData(0, 0, w, h)
      const s = sharp.data
      const u = soft.data
      const amount = 1.15
      for (let i = 0; i < s.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          const v = s[i + c]! + amount * (s[i + c]! - u[i + c]!)
          s[i + c] = Math.max(0, Math.min(255, v))
        }
      }
      ctx.putImageData(sharp, 0, 0)
    }
  } catch {
    /* optional */
  }

  return canvas.toDataURL('image/jpeg', 0.9)
}

export function visionConfigured(): boolean {
  return Boolean(getApiKey())
}

async function callGemini(
  apiKey: string,
  model: string,
  mime: string,
  data: string,
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: PROMPT }, { inline_data: { mime_type: mime, data } }],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
        },
      }),
    },
  )
  const raw = await res.text()
  if (!res.ok) {
    let msg = raw.slice(0, 240)
    try {
      msg = JSON.parse(raw).error?.message ?? msg
    } catch {
      /* keep */
    }
    const err = new Error(`${model} HTTP ${res.status}: ${msg}`)
    ;(err as Error & { status?: number }).status = res.status
    throw err
  }
  const json = JSON.parse(raw) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
}

/**
 * Gemini vision for weekly Chinese lunch grids.
 * Retries with a smaller image / next model on 503/404/payload errors.
 * Does not fall back to Tesseract.
 */
export async function visionExtractDishes(
  imageDataUrl: string,
  onProgress?: VisionProgress,
): Promise<{ text: string; dishes: OcrDishDraft[] }> {
  const apiKeys = getApiKeys()
  if (!apiKeys.length) {
    throw new Error('Missing Gemini API key (VITE_GEMINI_API_KEY or VITE_FIREBASE_API_KEY)')
  }

  const widths = [1600, 1200, 1000]
  const models = getModels()
  const errors: string[] = []

  for (const targetW of widths) {
    onProgress?.(`Preparing image for Gemini (${targetW}px)…`)
    let prepared: string
    try {
      prepared = await prepareVisionImage(imageDataUrl, targetW)
    } catch (e) {
      errors.push(`prepare@${targetW}: ${e instanceof Error ? e.message : String(e)}`)
      continue
    }
    const { mime, data } = await dataUrlToBase64(prepared)
    if (data.length > 3_500_000) {
      errors.push(`payload@${targetW} too large (${Math.round(data.length / 1024)} KB b64)`)
      continue
    }

    for (const apiKey of apiKeys) {
      const keyTag = apiKey === apiKeys[0] ? 'primary-key' : 'firebase-key'
      for (const model of models) {
        onProgress?.(`Gemini vision (${model}, ${keyTag})…`)
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 90_000)
        try {
          const text = await callGemini(apiKey, model, mime, data, ctrl.signal)
          const dishes = parseVisionJson(text)
          if (!dishes.length) {
            errors.push(`${model}@${targetW}/${keyTag}: empty dish list`)
            continue
          }
          onProgress?.(`Gemini found ${dishes.length} dishes — review before save`)
          return { text, dishes }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          const status = (e as Error & { status?: number }).status
          errors.push(`${model}@${targetW}/${keyTag}: ${msg}`)
          if (status === 400 || /payload|inline|too large|invalid argument/i.test(msg)) break
          if (status === 403 || /referer|API_KEY|permission|blocked/i.test(msg)) {
            // try next API key
            break
          }
          if (msg.includes('abort')) {
            errors.push('request timed out (90s)')
            break
          }
        } finally {
          clearTimeout(timer)
        }
      }
    }
  }

  throw new Error(errors.slice(-5).join(' · ') || 'Gemini vision failed')
}
