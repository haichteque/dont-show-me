import { isSvg } from '../../src/utils/isSvg'

describe('utils => isSvg', () => {
  test('returns false for falsy or empty inputs', () => {
    expect(isSvg(null)).toBe(false)
    expect(isSvg(undefined)).toBe(false)
    expect(isSvg('')).toBe(false)
  })

  test('identifies data:image/svg+xml URIs', () => {
    expect(isSvg('data:image/svg+xml;utf8,<svg></svg>')).toBe(true)
    expect(isSvg('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe(true)
    expect(isSvg('data:image/png;base64,iVBORw0KGgo=')).toBe(false)
  })

  test('identifies .svg URL extensions with queries and hashes', () => {
    expect(isSvg('https://example.com/logo.svg')).toBe(true)
    expect(isSvg('https://example.com/logo.svg?v=123')).toBe(true)
    expect(isSvg('https://example.com/logo.svg#icon')).toBe(true)
    expect(isSvg('/icons/diagram.SVG')).toBe(true)
    expect(isSvg('https://example.com/photo.svg.png')).toBe(false)
    expect(isSvg('https://example.com/photo.png')).toBe(false)
    expect(isSvg('https://example.com/photo.jpg?fallback=true')).toBe(false)
  })
})
