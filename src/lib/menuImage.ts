/** Client-side compress for Spark Firestore menu photos (no Cloud Storage on free tier). */

const MAX_EDGE = 1600
const MAX_BYTES = 850_000
const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55, 0.45]

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Could not read image'))
    }
    img.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Compress failed'))),
      'image/jpeg',
      quality,
    )
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Read failed'))
    reader.readAsDataURL(blob)
  })
}

/** Resize + JPEG-compress a menu photo into a data URL small enough for Firestore. */
export async function compressMenuImage(file: File): Promise<{ dataUrl: string; bytes: number }> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (JPG, PNG, WebP, …)')
  }
  const img = await loadImage(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.drawImage(img, 0, 0, w, h)

  let last: Blob | null = null
  for (const q of QUALITY_STEPS) {
    last = await canvasToBlob(canvas, q)
    if (last.size <= MAX_BYTES) break
  }
  if (!last) throw new Error('Compress failed')
  if (last.size > MAX_BYTES) {
    throw new Error(`Image still too large after compress (${Math.round(last.size / 1024)} KB). Try a clearer crop.`)
  }
  const dataUrl = await blobToDataUrl(last)
  return { dataUrl, bytes: last.size }
}
