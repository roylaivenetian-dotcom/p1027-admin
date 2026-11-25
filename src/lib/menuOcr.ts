import type { OcrDishDraft } from './menuOcrParse'
import { visionConfigured, visionExtractDishes } from './menuVisionOcr'

export type { OcrDishDraft }
export { parseOcrDishLines, parseDayCellText, mergeDishDrafts } from './menuOcrParse'

export type OcrProgress = (msg: string) => void

/**
 * Extract dishes via browser Gemini vision (fast).
 * Keeps weekday tagging. No WhatsApp Grok job wait. No Tesseract fallback.
 * Status engine label is `gemini` on success.
 */
export async function ocrMenuImage(
  image: string,
  onProgress?: OcrProgress,
): Promise<{ text: string; dishes: OcrDishDraft[]; engine: 'gemini' }> {
  if (!visionConfigured()) {
    throw new Error(
      'Gemini vision is not configured (missing VITE_GEMINI_API_KEY / VITE_FIREBASE_API_KEY). Fix env and redeploy — Tesseract fallback is disabled.',
    )
  }

  try {
    const result = await visionExtractDishes(image, onProgress)
    return { ...result, engine: 'gemini' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`Gemini vision failed: ${msg}`)
  }
}

export function slugMenuItemId(nameZh: string, weekday?: string | null): string {
  const base = nameZh.trim().replace(/\s+/g, '').slice(0, 40)
  const day = weekday?.trim() ? `_${weekday.trim()}` : ''
  return `cap_${base || 'item'}${day}_${Math.abs(hash(`${weekday ?? ''}|${nameZh}`))}`
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}
