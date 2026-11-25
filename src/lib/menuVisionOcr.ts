import type { MenuCategory } from '../types'
import type { OcrDishDraft } from './menuOcrParse'
import { createMenuVisionJob, subscribeMenuVisionJob } from '../services/firestoreData'

export type VisionProgress = (msg: string) => void

/** P1027 Admin Group — same jid the WhatsApp Grok bot watches. */
export const FOOD_CHAT_JID = '85297868213-1620171799@g.us'

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
  return true
}

function dishesFromJob(raw: unknown): OcrDishDraft[] {
  if (!Array.isArray(raw)) return []
  const out: OcrDishDraft[] = []
  const seen = new Set<string>()
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    let nameZh = String(r.nameZh ?? r.name ?? '')
      .replace(/^\d+\s*[.．、\)]\s*/, '')
      .replace(/\s+/g, '')
      .trim()
    nameZh = applyTradFixes(nameZh)
    if (!looksLikeDish(nameZh) || seen.has(nameZh)) continue
    seen.add(nameZh)
    out.push({
      key: `vision-${out.length}-${Date.now()}`,
      nameZh,
      nameEn: '',
      category: normalizeCategory(r.category),
    })
  }
  return out
}

/**
 * True when Menu can queue a vision job for the P1027 Admin Grok bot
 * (needs Spark writeToken baked into the Hosting build).
 */
export function visionConfigured(): boolean {
  const t = import.meta.env.VITE_FIREBASE_WRITE_TOKEN as string | undefined
  return Boolean(t && !t.includes('YOUR_') && t.length >= 8)
}

/**
 * Optional hosted Agent SDK webhook (whatsapp-food-feed channel).
 * When unset, the Grok bot picks jobs up via its menu-vision schedule / Cursor run.
 */
async function nudgeGrokBot(jobId: string): Promise<void> {
  const base = (import.meta.env.VITE_GROK_BOT_URL as string | undefined)?.replace(/\/$/, '')
  const token = import.meta.env.VITE_GROK_BOT_ALIAS_TOKEN as string | undefined
  if (!base) return
  try {
    await fetch(`${base}/v1/channels/menu-vision/extract`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-Agent-Alias-Token': token } : {}),
      },
      body: JSON.stringify({ jobId }),
    })
  } catch {
    /* schedule / manual bot run still processes the Firestore job */
  }
}

const DEFAULT_TIMEOUT_MS = 180_000

/**
 * Queue menu photo for the P1027 Admin WhatsApp Grok bot (Firestore job).
 * Polls until the bot writes dishes. No Gemini / no Tesseract.
 */
export async function visionExtractDishes(
  imageDataUrl: string,
  onProgress?: VisionProgress,
): Promise<{ text: string; dishes: OcrDishDraft[] }> {
  if (!visionConfigured()) {
    throw new Error(
      'Grok bot vision queue needs VITE_FIREBASE_WRITE_TOKEN (same Spark writeToken as Menu saves).',
    )
  }

  onProgress?.('Queuing menu for P1027 Admin Grok bot…')
  const job = await createMenuVisionJob(imageDataUrl)
  onProgress?.(
    `Waiting for Grok bot (job ${job.id})… WhatsApp group ${FOOD_CHAT_JID}`,
  )
  void nudgeGrokBot(job.id)

  return await new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      unsub()
      reject(
        new Error(
          `Grok bot timed out after ${Math.round(DEFAULT_TIMEOUT_MS / 1000)}s (job ${job.id}). Ensure whatsapp-food-feed is running / scheduled, then Retry.`,
        ),
      )
    }, DEFAULT_TIMEOUT_MS)

    const unsub = subscribeMenuVisionJob(job.id, (live) => {
      if (!live || settled) return
      if (live.status === 'running') {
        onProgress?.(`Grok bot reading menu (${live.id})…`)
        return
      }
      if (live.status === 'error') {
        settled = true
        clearTimeout(timer)
        unsub()
        reject(new Error(live.error || 'Grok bot vision failed'))
        return
      }
      if (live.status === 'done') {
        const dishes = dishesFromJob(live.dishes)
        settled = true
        clearTimeout(timer)
        unsub()
        if (!dishes.length) {
          reject(new Error('Grok bot returned no dishes'))
          return
        }
        onProgress?.(`Grok found ${dishes.length} dishes — review before save`)
        resolve({
          text: JSON.stringify({ dishes: live.dishes }, null, 0),
          dishes,
        })
      }
    })
  })
}
