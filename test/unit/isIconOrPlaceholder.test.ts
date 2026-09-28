/**
 * @jest-environment jsdom
 */
import { isIconOrPlaceholder } from '../../src/utils/isIconOrPlaceholder'

describe('utils => isIconOrPlaceholder', () => {
  test('returns false for null or undefined', () => {
    expect(isIconOrPlaceholder(null as any)).toBe(false)
  })

  test('identifies data:image/gif URIs', () => {
    const img = document.createElement('img')
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    expect(isIconOrPlaceholder(img)).toBe(true)
  })

  test('identifies tracking pixel and default avatar patterns in src', () => {
    const img1 = document.createElement('img')
    img1.src = 'https://example.com/assets/favicon.ico'
    expect(isIconOrPlaceholder(img1)).toBe(true)

    const img2 = document.createElement('img')
    img2.src = 'https://example.com/images/default_avatar.png'
    expect(isIconOrPlaceholder(img2)).toBe(true)

    const img3 = document.createElement('img')
    img3.src = 'https://example.com/pixel/track.png'
    expect(isIconOrPlaceholder(img3)).toBe(true)
  })

  test('identifies explicit 1x1 tracking pixels', () => {
    const img = document.createElement('img')
    img.src = 'https://example.com/some_tracker.png'
    img.setAttribute('width', '1')
    img.setAttribute('height', '1')
    expect(isIconOrPlaceholder(img)).toBe(true)
  })

  test('identifies decorative presentation icons', () => {
    const img = document.createElement('img')
    img.src = 'https://example.com/menu-icon.png'
    img.setAttribute('role', 'presentation')
    img.width = 32
    img.height = 32
    expect(isIconOrPlaceholder(img)).toBe(true)
  })

  test('returns false for normal content images', () => {
    const img = document.createElement('img')
    img.src = 'https://example.com/photo.jpg'
    img.width = 400
    img.height = 300
    expect(isIconOrPlaceholder(img)).toBe(false)
  })
})
