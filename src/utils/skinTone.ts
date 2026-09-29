/**
 * Fast, lightweight O(N) skin-tone ratio estimator.
 * Samples a downscaled canvas (64x64 = 4,096 pixels) to calculate the fraction
 * of visible (non-transparent) pixels that fall within human skin-tone chrominance.
 *
 * Based on the standard Peer et al. daylight/indoor skin detection rule in RGB:
 * R > 95 && G > 40 && B > 20 &&
 * (max(R,G,B) - min(R,G,B) > 15) &&
 * abs(R - G) > 15 && R > G && R > B
 */
export const getSkinToneRatio = (source: CanvasImageSource, width: number = 64, height: number = 64): number => {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return 0.5 // Fallback to neutral if canvas context unavailable

    ctx.drawImage(source, 0, 0, width, height)
    const { data } = ctx.getImageData(0, 0, width, height)

    let skinPixels = 0
    let visiblePixels = 0

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3]
      if (alpha < 50) continue // Skip transparent/background pixels

      visiblePixels++
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]

      // Peer et al. skin detection condition
      const isSkin = (
        r > 95 &&
        g > 40 &&
        b > 20 &&
        (Math.max(r, g, b) - Math.min(r, g, b) > 15) &&
        Math.abs(r - g) > 15 &&
        r > g &&
        r > b
      )

      if (isSkin) skinPixels++
    }

    return visiblePixels > 0 ? (skinPixels / visiblePixels) : 0
  } catch {
    return 0.5 // Safe fallback on CORS or DOM exceptions
  }
}
