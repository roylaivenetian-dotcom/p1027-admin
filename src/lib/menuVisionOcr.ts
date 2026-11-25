import type { MenuCategory } from '../types'
import type { OcrDishDraft } from './menuOcrParse'
import { normalizeMenuWeekday } from './menuWeekday'

export type VisionProgress = (msg: string) => void
export type VisionEngine = 'gemini' | 'qwen'

const GEMINI_MODELS = [
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-3.5-flash-lite',
]

const QWEN_MODELS = ['qwen3-vl-plus', 'qwen-vl-plus', 'qwen-vl-max']

/** Models that returned region/location unsupported — skip for this page session. */
const skippedGeminiModels = new Set<string>()

const PROMPT = `你是香港繁體中文菜單逐字抄寫員（不是簡體翻譯器、不是同音猜字）。任務：從每週午膳菜單照片準確抄出每道菜的繁體中文菜名，並標明星期欄。

圖片通常是「鴻運美德小館」風格：星期一至星期六六欄，每欄編號 1–9。

只輸出 JSON（不要 markdown code fence）：
{"dishes":[{"nameZh":"繁體中文菜名","weekday":"mon","nameEn":"","category":"meal"}]}

weekday 必須是 mon|tue|wed|thu|fri|sat（對應 星期一…星期六）。

嚴格規則：
1. 必須用「繁體中文」字形。不要簡化、不要用同音/近形字代替。
2. 逐字對照照片筆畫；不確定就再看清楚，不要發明常見錯字。
3. 常見易錯字：韭菜花（不是九菜）、芥蘭（不是介蘭）、蘿蔔（不是羅白）、炆、豉、燒、炒、炸、焗、扒、腩、鯪、魷、豆卜、豬手、豬頸肉、涼瓜、椰汁、香芋。
4. **每個星期欄的每道菜各一列**，並填對 weekday。同一菜名若出現在另一天，必須另列（不同 weekday）。
5. 只對相同 nameZh+weekday 去重。不要把整週壓成約 30 道；整週約 40–55 列、約 43 個不重複菜名。
6. 去掉 1. 2. 編號與價錢。nameEn 一律 ""。
7. 忽略店名、電話、外賣說明、星期標題、表格線。
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
    const weekday =
      normalizeMenuWeekday(r.weekday ?? r.day ?? r.weekdayZh ?? r.weekDay) ?? null
    const dedupe = `${weekday ?? ''}:${nameZh}`
    if (!looksLikeDish(nameZh) || seen.has(dedupe)) continue
    seen.add(dedupe)
    out.push({
      key: `vision-${out.length}-${Date.now()}`,
      nameZh,
      nameEn: '',
      category: normalizeCategory(r.category),
      weekday,
    })
  }
  return out
}

function env(name: string): string | undefined {
  const v = (import.meta.env as Record<string, string | undefined>)[name]
  if (!v || v.includes('YOUR_')) return undefined
  return v.trim() || undefined
}

function getGeminiKeys(): string[] {
  const keys: string[] = []
  for (const k of [env('VITE_GEMINI_API_KEY'), env('VITE_FIREBASE_API_KEY')]) {
    if (k && k.length > 20 && !keys.includes(k)) keys.push(k)
  }
  return keys
}

function getGeminiModels(): string[] {
  const preferred = env('VITE_GEMINI_MODEL')
  const base = preferred
    ? [preferred, ...GEMINI_MODELS.filter((m) => m !== preferred)]
    : [...GEMINI_MODELS]
  return base.filter((m) => !skippedGeminiModels.has(m))
}

type DashScopeConfig = {
  apiKey: string
  baseUrl: string
  models: string[]
}

function getDashScopeConfig(): DashScopeConfig | null {
  const apiKey =
    env('VITE_DASHSCOPE_API_KEY') ||
    env('VITE_DASHSCOPE_KEY') ||
    env('DASHSCOPE_API_KEY') // only if Vite defines it
  if (!apiKey || apiKey.length < 16) return null

  const workspace =
    env('VITE_DASHSCOPE_WORKSPACE_ID') ||
    env('VITE_DASHSCOPE_WORKSPACE') ||
    env('DASHSCOPE_WORKSPACE_ID')
  const explicitBase = env('VITE_DASHSCOPE_BASE_URL') || env('DASHSCOPE_BASE_URL')

  let baseUrl = explicitBase?.replace(/\/$/, '')
  if (!baseUrl && workspace) {
    baseUrl = `https://${workspace}.cn-hongkong.maas.aliyuncs.com/compatible-mode/v1`
  }
  if (!baseUrl) {
    // Intl DashScope OpenAI-compatible (no workspace id)
    baseUrl = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
  }

  const preferred = env('VITE_DASHSCOPE_MODEL') || env('VITE_QWEN_VL_MODEL')
  const models = preferred
    ? [preferred, ...QWEN_MODELS.filter((m) => m !== preferred)]
    : [...QWEN_MODELS]

  return { apiKey, baseUrl, models }
}

export function visionConfigured(): boolean {
  return getGeminiKeys().length > 0 || Boolean(getDashScopeConfig())
}

function softGeminiMessage(status: number | undefined, msg: string): string {
  if (status === 429 || /quota|rate.?limit|RESOURCE_EXHAUSTED|free.?tier/i.test(msg)) {
    return 'Gemini free-tier quota reached — try Qwen/DashScope or retry later'
  }
  if (
    status === 400 &&
    /location|not supported|FAILED_PRECONDITION|User location is not supported/i.test(msg)
  ) {
    return 'Gemini model unavailable in this region — skipped'
  }
  if (status === 404 || /not found|is not found for API version/i.test(msg)) {
    return 'Gemini model not available — skipped'
  }
  if (status === 403 || /API_KEY|permission|blocked|referer/i.test(msg)) {
    return 'Gemini API key blocked or referrer-restricted'
  }
  return msg.length > 160 ? `${msg.slice(0, 160)}…` : msg
}

function isSkipGeminiModel(status: number | undefined, msg: string): boolean {
  if (status === 404) return true
  if (status === 400 && /location|not supported|FAILED_PRECONDITION|User location/i.test(msg)) {
    return true
  }
  if (/is not found for API version|Unsupported model/i.test(msg)) return true
  return false
}

function isQuotaExhausted(status: number | undefined, msg: string): boolean {
  return status === 429 || /quota|rate.?limit|RESOURCE_EXHAUSTED|free.?tier/i.test(msg)
}

async function dataUrlToBase64(dataUrl: string): Promise<{ mime: string; data: string; dataUrl: string }> {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (m) return { mime: m[1]!, data: m[2]!, dataUrl }
  const res = await fetch(dataUrl)
  const blob = await res.blob()
  const buf = await blob.arrayBuffer()
  let binary = ''
  const bytes = new Uint8Array(buf)
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
  const b64 = btoa(binary)
  const mime = blob.type || 'image/jpeg'
  return { mime, data: b64, dataUrl: `data:${mime};base64,${b64}` }
}

export async function prepareVisionImage(dataUrl: string, targetW = 1600): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('Vision image load failed'))
    el.src = dataUrl
  })
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
  return canvas.toDataURL('image/jpeg', 0.9)
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
    let msg = raw.slice(0, 280)
    try {
      msg = JSON.parse(raw).error?.message ?? msg
    } catch {
      /* keep */
    }
    const err = new Error(msg)
    ;(err as Error & { status?: number }).status = res.status
    throw err
  }
  const json = JSON.parse(raw) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  return json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
}

async function callDashScope(
  cfg: DashScopeConfig,
  model: string,
  imageDataUrl: string,
  signal: AbortSignal,
): Promise<string> {
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    signal,
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageDataUrl } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    }),
  })
  const raw = await res.text()
  if (!res.ok) {
    let msg = raw.slice(0, 280)
    try {
      const parsed = JSON.parse(raw) as { error?: { message?: string } | string; message?: string }
      msg =
        (typeof parsed.error === 'string' ? parsed.error : parsed.error?.message) ??
        parsed.message ??
        msg
    } catch {
      /* keep */
    }
    const err = new Error(msg)
    ;(err as Error & { status?: number }).status = res.status
    throw err
  }
  const json = JSON.parse(raw) as {
    choices?: { message?: { content?: string | { type?: string; text?: string }[] } }[]
  }
  const content = json.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((p) => (typeof p === 'string' ? p : p.text ?? '')).join('')
  }
  return ''
}

/**
 * Menu dish vision: Gemini first (when quota/region OK), then DashScope/Qwen.
 * Soft-skips unsupported Gemini models and free-tier 429s. No Tesseract.
 */
export async function visionExtractDishes(
  imageDataUrl: string,
  onProgress?: VisionProgress,
): Promise<{ text: string; dishes: OcrDishDraft[]; engine: VisionEngine }> {
  const geminiKeys = getGeminiKeys()
  const dash = getDashScopeConfig()
  if (!geminiKeys.length && !dash) {
    throw new Error(
      'No vision provider configured. Set VITE_GEMINI_API_KEY and/or VITE_DASHSCOPE_API_KEY (+ workspace id).',
    )
  }

  const notes: string[] = []
  const widths = [1400, 1100]
  let geminiQuotaHit = false

  for (const targetW of widths) {
    onProgress?.(`Preparing menu image (${targetW}px)…`)
    let prepared: string
    try {
      prepared = await prepareVisionImage(imageDataUrl, targetW)
    } catch (e) {
      notes.push(`prepare: ${e instanceof Error ? e.message : String(e)}`)
      continue
    }
    const { mime, data, dataUrl } = await dataUrlToBase64(prepared)
    if (data.length > 3_500_000) {
      notes.push(`image too large @${targetW}`)
      continue
    }

    // —— Gemini ——
    if (geminiKeys.length && !geminiQuotaHit) {
      const models = getGeminiModels()
      for (const apiKey of geminiKeys) {
        for (const model of models) {
          onProgress?.(`Gemini (${model})…`)
          const ctrl = new AbortController()
          const timer = setTimeout(() => ctrl.abort(), 75_000)
          try {
            const text = await callGemini(apiKey, model, mime, data, ctrl.signal)
            const dishes = parseVisionJson(text)
            if (!dishes.length) {
              notes.push(`${model}: empty list`)
              continue
            }
            onProgress?.(`Gemini found ${dishes.length} dishes — review before save`)
            return { text, dishes, engine: 'gemini' }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            const status = (e as Error & { status?: number }).status
            const soft = softGeminiMessage(status, msg)
            notes.push(`${model}: ${soft}`)
            if (isSkipGeminiModel(status, msg)) {
              skippedGeminiModels.add(model)
              onProgress?.(`${soft} — trying next…`)
              continue
            }
            if (isQuotaExhausted(status, msg)) {
              geminiQuotaHit = true
              onProgress?.(`${soft} — trying Qwen if configured…`)
              break
            }
            if (msg.includes('abort')) {
              notes.push('Gemini timed out')
              break
            }
            // payload errors → try smaller width
            if (status === 400 || /payload|inline|too large/i.test(msg)) break
          } finally {
            clearTimeout(timer)
          }
        }
        if (geminiQuotaHit) break
      }
    }

    // —— DashScope / Qwen (HK workspace or intl) ——
    if (dash) {
      for (const model of dash.models) {
        onProgress?.(`Qwen vision (${model})…`)
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 90_000)
        try {
          const text = await callDashScope(dash, model, dataUrl, ctrl.signal)
          const dishes = parseVisionJson(text)
          if (!dishes.length) {
            notes.push(`qwen/${model}: empty list`)
            continue
          }
          onProgress?.(`Qwen found ${dishes.length} dishes — review before save`)
          return { text, dishes, engine: 'qwen' }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          const status = (e as Error & { status?: number }).status
          const short = msg.length > 140 ? `${msg.slice(0, 140)}…` : msg
          notes.push(`qwen/${model}: ${status ? `HTTP ${status} ` : ''}${short}`)
          if (status === 401 || status === 403) break
          if (msg.includes('abort')) {
            notes.push('Qwen timed out')
            break
          }
        } finally {
          clearTimeout(timer)
        }
      }
    }
  }

  const hint = dash
    ? 'Gemini and Qwen both failed'
    : 'Gemini failed (add VITE_DASHSCOPE_API_KEY + VITE_DASHSCOPE_WORKSPACE_ID for Qwen HK fallback)'
  const detail = notes.slice(-4).join(' · ') || 'no details'
  throw new Error(`${hint}. ${detail}`)
}
