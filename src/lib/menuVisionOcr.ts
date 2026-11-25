import type { MenuCategory } from '../types'
import type { OcrDishDraft } from './menuOcrParse'
import {
  createMenuVisionJob,
  fetchMenuVisionJob,
  subscribeMenuVisionJob,
} from '../services/firestoreData'

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

export function visionConfigured(): boolean {
  const t = import.meta.env.VITE_FIREBASE_WRITE_TOKEN as string | undefined
  return Boolean(t && !t.includes('YOUR_') && t.length >= 8)
}

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
    /* schedule still processes */
  }
}

const DEFAULT_TIMEOUT_MS = 180_000
const POLL_MS = 1500

function settleFromJob(
  live: { id: string; status: string; dishes: unknown; error: string | null },
  onProgress?: VisionProgress,
): { ok: true; dishes: OcrDishDraft[]; text: string } | { ok: false; error: string } | null {
  if (live.status === 'running') {
    onProgress?.(`Grok bot reading menu (${live.id})…`)
    return null
  }
  if (live.status === 'error') {
    return { ok: false, error: live.error || 'Grok bot vision failed' }
  }
  if (live.status === 'done') {
    const dishes = dishesFromJob(live.dishes)
    if (!dishes.length) return { ok: false, error: 'Grok bot returned no dishes' }
    onProgress?.(`Grok found ${dishes.length} dishes — review before save`)
    return {
      ok: true,
      dishes,
      text: JSON.stringify({ dishes: live.dishes }, null, 0),
    }
  }
  return null
}

/**
 * Queue menu photo for the P1027 Admin WhatsApp Grok bot (Firestore job).
 * Snapshot + getDoc poll until done. No Gemini / no Tesseract.
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
  onProgress?.(`Waiting for Grok bot (job ${job.id})…`)
  void nudgeGrokBot(job.id)

  return await new Promise((resolve, reject) => {
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearInterval(poll)
      unsub()
      fn()
    }

    const handle = (live: { id: string; status: string; dishes: unknown; error: string | null } | null) => {
      if (!live || settled) return
      if (live.status === 'pending') {
        onProgress?.(`Waiting for Grok bot (job ${live.id})…`)
        return
      }
      const result = settleFromJob(live, onProgress)
      if (!result) return
      if (result.ok) finish(() => resolve({ text: result.text, dishes: result.dishes }))
      else finish(() => reject(new Error(result.error)))
    }

    const timer = setTimeout(() => {
      finish(() =>
        reject(
          new Error(
            `Grok bot timed out after ${Math.round(DEFAULT_TIMEOUT_MS / 1000)}s (job ${job.id}). Host whatsapp-food-feed or Retry.`,
          ),
        ),
      )
    }, DEFAULT_TIMEOUT_MS)

    const unsub = subscribeMenuVisionJob(job.id, handle)

    const poll = setInterval(() => {
      void fetchMenuVisionJob(job.id).then(handle).catch(() => undefined)
    }, POLL_MS)

    // Immediate getDoc in case snapshot is delayed
    void fetchMenuVisionJob(job.id).then(handle).catch(() => undefined)
  })
}
