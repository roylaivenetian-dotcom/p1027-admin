import type { OcrDishDraft } from './menuOcrParse'
import { visionConfigured, visionExtractDishes, type VisionEngine } from './menuVisionOcr'

export type { OcrDishDraft }
export { parseOcrDishLines, parseDayCellText, mergeDishDrafts } from './menuOcrParse'

export type OcrProgress = (msg: string) => void

/**
 * Browser vision: Gemini first, DashScope/Qwen when configured / Gemini quota fails.
 * Weekday tagging preserved. No Tesseract fallback.
 */
export async function ocrMenuImage(
  image: string,
  onProgress?: OcrProgress,
): Promise<{ text: string; dishes: OcrDishDraft[]; engine: VisionEngine }> {
  if (!visionConfigured()) {
    throw new Error(
      'Vision not configured — set VITE_GEMINI_API_KEY and/or VITE_DASHSCOPE_API_KEY (+ workspace id), then redeploy.',
    )
  }

  try {
    return await visionExtractDishes(image, onProgress)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Already softened in menuVisionOcr — don't wrap with raw HTTP dumps
    throw new Error(msg)
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
