import { createWorker, PSM, type Worker } from 'tesseract.js'
import {
  mergeDishDrafts,
  parseDayCellText,
  parseOcrDishLines,
  type OcrDishDraft,
} from './menuOcrParse'
import { preprocessForOcr, splitWeeklyDayCells } from './menuOcrPreprocess'
import { visionConfigured, visionExtractDishes } from './menuVisionOcr'

export type { OcrDishDraft }
export { parseOcrDishLines, parseDayCellText, mergeDishDrafts } from './menuOcrParse'

let workerPromise: Promise<Worker> | null = null

async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('chi_tra', 1, {
        logger: () => {
          /* progress via onProgress */
        },
      })
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: '1',
      })
      return worker
    })()
  }
  return workerPromise
}

export type OcrProgress = (msg: string) => void

async function recognizeText(image: string, onProgress?: OcrProgress, label?: string): Promise<string> {
  const worker = await getWorker()
  if (label) onProgress?.(`OCR ${label}…`)
  const result = await worker.recognize(image)
  return result.data.text ?? ''
}

/** Tesseract fallback: preprocess → 2×3 day cells → parse. */
async function tesseractExtractDishes(
  image: string,
  onProgress?: OcrProgress,
): Promise<{ text: string; dishes: OcrDishDraft[] }> {
  onProgress?.('Vision unavailable — Tesseract grid fallback…')
  const canvas = await preprocessForOcr(image)
  const cells = splitWeeklyDayCells(canvas)

  onProgress?.(`Reading ${cells.length} day columns…`)
  const texts: string[] = []
  const groups: ReturnType<typeof parseDayCellText>[] = []

  for (const cell of cells) {
    const text = await recognizeText(cell.dataUrl, onProgress, cell.dayHint)
    texts.push(`--- ${cell.dayHint} ---\n${text}`)
    groups.push(parseDayCellText(text, cell.dayHint))
  }

  let dishes = mergeDishDrafts(groups)

  if (dishes.length < 8) {
    onProgress?.('Grid yielded few dishes — trying full page…')
    const fullUrl = canvas.toDataURL('image/png')
    const fullText = await recognizeText(fullUrl, onProgress, 'full page')
    texts.push(`--- full ---\n${fullText}`)
    const fullDishes = parseOcrDishLines(fullText)
    if (fullDishes.length > dishes.length) dishes = fullDishes
  }

  onProgress?.(
    dishes.length
      ? `Found ${dishes.length} dishes — review before save`
      : 'No dishes detected — add rows manually',
  )

  return { text: texts.join('\n\n'), dishes }
}

/**
 * Extract dishes from a menu photo.
 * Primary: Gemini vision (Firebase / VITE_GEMINI_API_KEY).
 * Fallback: Tesseract chi_tra grid crops.
 */
export async function ocrMenuImage(
  image: string,
  onProgress?: OcrProgress,
): Promise<{ text: string; dishes: OcrDishDraft[]; engine: 'vision' | 'tesseract' }> {
  if (visionConfigured()) {
    try {
      const result = await visionExtractDishes(image, onProgress)
      return { ...result, engine: 'vision' }
    } catch (e) {
      console.warn('Vision OCR failed, falling back to Tesseract', e)
      onProgress?.(
        `Vision failed (${e instanceof Error ? e.message.slice(0, 80) : 'error'}) — trying Tesseract…`,
      )
    }
  }

  const result = await tesseractExtractDishes(image, onProgress)
  return { ...result, engine: 'tesseract' }
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
