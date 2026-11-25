import type { OcrDishDraft } from './menuOcrParse'
import { visionConfigured, visionExtractDishes } from './menuVisionOcr'

export type { OcrDishDraft }
export { parseOcrDishLines, parseDayCellText, mergeDishDrafts } from './menuOcrParse'

export type OcrProgress = (msg: string) => void

/**
 * Extract dishes via the P1027 Admin WhatsApp Grok bot (Firestore menuVisionJobs).
 * No Gemini. No Tesseract fallback. Status engine label is `grok` on success.
 */
export async function ocrMenuImage(
  image: string,
  onProgress?: OcrProgress,
): Promise<{ text: string; dishes: OcrDishDraft[]; engine: 'grok' }> {
  if (!visionConfigured()) {
    throw new Error(
      'Grok bot vision is not configured (missing VITE_FIREBASE_WRITE_TOKEN). Fix env and redeploy — Tesseract fallback is disabled.',
    )
  }

  try {
    const result = await visionExtractDishes(image, onProgress)
    return { ...result, engine: 'grok' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`Grok vision failed: ${msg}`)
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
