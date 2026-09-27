export const isSvg = (src?: string | null): boolean => {
  if (!src || typeof src !== 'string') return false
  return src.startsWith('data:image/svg+xml') || /\.svg($|[?#])/i.test(src)
}
