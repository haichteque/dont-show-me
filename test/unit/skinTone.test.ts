import { getSkinToneRatio } from '../../src/utils/skinTone'

describe('utils => skinTone', () => {
  test('returns fallback value gracefully when canvas 2D context is unavailable', () => {
    const dummy = {} as any
    const ratio = getSkinToneRatio(dummy)
    expect(typeof ratio).toBe('number')
    expect(ratio).toBeGreaterThanOrEqual(0)
    expect(ratio).toBeLessThanOrEqual(1)
  })
})
