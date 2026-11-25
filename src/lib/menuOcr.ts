import type { OcrDishDraft } from './menuOcrParse'
import { visionConfigured, visionExtractDishes } from './menuVisionOcr'

export type { OcrDishDraft }
export { parseOcrDishLines, parseDayCellText, mergeDishDrafts } from './menuOcrParse'

export type OcrProgress = (msg: string) => void

/**
 * Extract dishes from a menu photo via Gemini vision only.
 * Does **not** fall back to Tesseract (garbage on Chinese weekly grids).
 * Status engine label is always `gemini` on success.
 */
export async function ocrMenuImage(
  image: string,
  onProgress?: OcrProgress,
): Promise<{ text: string; dishes: OcrDishDraft[]; engine: 'gemini' }> {
  if (!visionConfigured()) {
    throw new Error(
      'Gemini vision is not configured (missing VITE_FIREBASE_API_KEY / VITE_GEMINI_API_KEY). Fix env and redeploy — Tesseract fallback is disabled for Chinese weekly menus.',
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

export function slugMenuItemId(nameZh: string): string {
  const base = nameZh.trim().replace(/\s+/g, '').slice(0, 40)
  return `cap_${base || 'item'}_${Math.abs(hash(nameZh))}`
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}
