import type { MenuPhotoDoc } from '../types'

/** True if orderDate (YYYY-MM-DD) falls in [effectiveFrom, effectiveTo] (open end if null). */
export function menuPhotoCoversDate(photo: MenuPhotoDoc, orderDate: string): boolean {
  if (!photo.effectiveFrom || orderDate < photo.effectiveFrom) return false
  if (photo.effectiveTo && orderDate > photo.effectiveTo) return false
  return true
}

/** Newest covering photo wins when ranges overlap (by effectiveFrom, then updatedAt). */
export function pickMenuPhotoForDate(photos: MenuPhotoDoc[], orderDate: string): MenuPhotoDoc | null {
  const hits = photos.filter((p) => menuPhotoCoversDate(p, orderDate))
  if (!hits.length) return null
  return [...hits].sort((a, b) => {
    const from = b.effectiveFrom.localeCompare(a.effectiveFrom)
    if (from) return from
    return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
  })[0]!
}
