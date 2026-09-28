const TRACKING_PATTERNS = [
  '/tracking/',
  '/telemetry/',
  '/beacon/',
  '/pixel/',
  'pixel.gif',
  '1x1.gif',
  'clear.gif',
  'favicon.',
  'avatar_small',
  'default_avatar',
  'default-avatar',
  'user_icon',
  'user-icon',
  'profile_avatar_placeholder'
]

export const isIconOrPlaceholder = (image: HTMLImageElement): boolean => {
  if (!image) return false

  const src = (image.currentSrc || image.src || '').toLowerCase()

  // 1. Data GIF spacer / tracking pixels
  if (src.startsWith('data:image/gif')) return true

  // 2. URL tracking or default icon patterns
  for (const pattern of TRACKING_PATTERNS) {
    if (src.includes(pattern)) return true
  }

  // 3. Explicit tracking pixel attributes
  const explicitW = parseFloat(image.getAttribute('width') || '')
  const explicitH = parseFloat(image.getAttribute('height') || '')
  if ((explicitW === 1 && explicitH === 1) || (image.width === 1 && image.height === 1)) {
    return true
  }

  // 4. Role presentation / aria-hidden for small decorative icons
  const role = image.getAttribute('role')
  const ariaHidden = image.getAttribute('aria-hidden') === 'true'
  const isDecorative = role === 'presentation' || role === 'none' || ariaHidden

  const w = image.width || image.naturalWidth || explicitW || 0
  const h = image.height || image.naturalHeight || explicitH || 0

  if (isDecorative && w > 0 && h > 0 && w <= 96 && h <= 96) {
    return true
  }

  // 5. Extreme aspect ratios (e.g. dividers, horizontal ribbons, vertical rules)
  if (w > 0 && h > 0) {
    const ratio = w / h
    if ((ratio > 3.5 || ratio < 0.28) && (w <= 120 || h <= 120)) {
      return true
    }
  }

  return false
}
