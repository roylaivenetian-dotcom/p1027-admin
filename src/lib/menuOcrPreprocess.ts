/** Canvas preprocess + weekly 2×3 grid crops for Chinese lunch menus. */

export type GridCell = {
  /** 0..5 Mon..Sat when using standard layout */
  index: number
  dayHint: string
  /** data URL of cropped cell (PNG) */
  dataUrl: string
}

const DAY_HINTS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

function loadImageFromUrl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image for OCR'))
    img.src = src
  })
}

/** Upscale + grayscale + contrast for Tesseract. */
export async function preprocessForOcr(sourceDataUrl: string, minWidth = 2200): Promise<HTMLCanvasElement> {
  const img = await loadImageFromUrl(sourceDataUrl)
  const scale = Math.max(1, minWidth / img.width)
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(img, 0, 0, w, h)

  const image = ctx.getImageData(0, 0, w, h)
  const d = image.data
  // Grayscale + contrast stretch
  let min = 255
  let max = 0
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!
    if (g < min) min = g
    if (g > max) max = g
  }
  const span = Math.max(1, max - min)
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!
    let v = ((g - min) / span) * 255
    // Mild contrast boost
    v = (v - 128) * 1.35 + 128
    v = Math.max(0, Math.min(255, v))
    // Soft threshold keeps strokes, kills gray paper noise
    if (v > 200) v = 255
    else if (v < 60) v = 0
    d[i] = d[i + 1] = d[i + 2] = v
  }
  ctx.putImageData(image, 0, 0)
  return canvas
}

function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png')
}

function cropCanvas(
  source: HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(source, x, y, w, h, 0, 0, c.width, c.height)
  return c
}

/**
 * Split a weekly set-menu into 6 day cells (2 rows × 3 cols).
 * Skips top header strip and bottom footer; insets slightly to avoid grid lines.
 */
export function splitWeeklyDayCells(preprocessed: HTMLCanvasElement): GridCell[] {
  const W = preprocessed.width
  const H = preprocessed.height
  // Header (shop / drinks) + footer (takeaway notes)
  const top = Math.round(H * 0.14)
  const bottom = Math.round(H * 0.90)
  const left = Math.round(W * 0.02)
  const right = Math.round(W * 0.98)
  const gridW = right - left
  const gridH = bottom - top
  const cols = 3
  const rows = 2
  const insetX = Math.round(gridW * 0.012)
  const insetY = Math.round(gridH * 0.02)
  const cellW = gridW / cols
  const cellH = gridH / rows

  const cells: GridCell[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const index = r * cols + c
      const x = left + c * cellW + insetX
      const y = top + r * cellH + insetY
      const w = cellW - insetX * 2
      const h = cellH - insetY * 2
      const cropped = cropCanvas(preprocessed, x, y, w, h)
      cells.push({
        index,
        dayHint: DAY_HINTS[index] ?? `day${index + 1}`,
        dataUrl: canvasToDataUrl(cropped),
      })
    }
  }
  return cells
}

/** Full-page preprocess data URL (for fallback OCR). */
export async function preprocessDataUrl(sourceDataUrl: string): Promise<string> {
  const canvas = await preprocessForOcr(sourceDataUrl)
  return canvasToDataUrl(canvas)
}
