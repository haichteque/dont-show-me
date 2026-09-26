/**
 * @jest-environment jsdom
 */

import {
  DEFAULT_GENDER_SETTINGS,
  GENDER_CLASSES,
  GenderClassifier,
  GenderFilterSettings
} from '../../src/offscreen/classifiers/GenderClassifier'
import {
  setGenderClass,
  setGenderFilterSettings,
  toggleBlurFemale,
  toggleBlurMale,
  toggleGenderFilter
} from '../../src/popup/redux/actions/settings/settingsActions'
import { settings, SettingsState } from '../../src/popup/redux/reducers/settings'
import { Logger } from '../../src/utils/Logger'

jest.mock('@tensorflow/tfjs', () => {
  return {
    loadGraphModel: jest.fn().mockResolvedValue({
      predict: jest.fn().mockReturnValue({
        data: async () => new Float32Array([0.05, 0.1, 0.05, 0.75, 0.05]),
        dispose: jest.fn()
      }),
      dispose: jest.fn()
    }),
    browser: {
      fromPixels: jest.fn()
    },
    image: {
      resizeBilinear: jest.fn(() => ({
        toFloat: () => ({
          div: () => ({
            expandDims: () => ({})
          })
        })
      }))
    },
    tidy: (fn: () => unknown) => fn()
  }
})

describe('Gender Filter Redux & Settings', () => {
  it('has correct default settings', () => {
    expect(DEFAULT_GENDER_SETTINGS.enabled).toBe(false)
    expect(DEFAULT_GENDER_SETTINGS.blurFemale).toBe(true)
    expect(DEFAULT_GENDER_SETTINGS.blurMale).toBe(false)
    expect(DEFAULT_GENDER_SETTINGS.classes.real_female).toBe(true)
    expect(DEFAULT_GENDER_SETTINGS.classes.anime_female).toBe(true)
    expect(DEFAULT_GENDER_SETTINGS.classes.real_male).toBe(false)
    expect(DEFAULT_GENDER_SETTINGS.classes.anime_male).toBe(false)
    expect(DEFAULT_GENDER_SETTINGS.classes.other).toBe(false)
  })

  it('handles TOGGLE_GENDER_FILTER', () => {
    const initial: SettingsState = settings(undefined, { type: '@@INIT' } as any)
    expect(initial.genderFilter.enabled).toBe(false)

    const next = settings(initial, toggleGenderFilter())
    expect(next.genderFilter.enabled).toBe(true)

    const toggledBack = settings(next, toggleGenderFilter())
    expect(toggledBack.genderFilter.enabled).toBe(false)
  })

  it('handles TOGGLE_BLUR_FEMALE and syncs individual female classes', () => {
    const initial: SettingsState = settings(undefined, { type: '@@INIT' } as any)
    expect(initial.genderFilter.blurFemale).toBe(true)
    expect(initial.genderFilter.classes.real_female).toBe(true)
    expect(initial.genderFilter.classes.anime_female).toBe(true)

    const off = settings(initial, toggleBlurFemale())
    expect(off.genderFilter.blurFemale).toBe(false)
    expect(off.genderFilter.classes.real_female).toBe(false)
    expect(off.genderFilter.classes.anime_female).toBe(false)

    const on = settings(off, toggleBlurFemale())
    expect(on.genderFilter.blurFemale).toBe(true)
    expect(on.genderFilter.classes.real_female).toBe(true)
    expect(on.genderFilter.classes.anime_female).toBe(true)
  })

  it('handles TOGGLE_BLUR_MALE and syncs individual male classes', () => {
    const initial: SettingsState = settings(undefined, { type: '@@INIT' } as any)
    expect(initial.genderFilter.blurMale).toBe(false)
    expect(initial.genderFilter.classes.real_male).toBe(false)
    expect(initial.genderFilter.classes.anime_male).toBe(false)

    const on = settings(initial, toggleBlurMale())
    expect(on.genderFilter.blurMale).toBe(true)
    expect(on.genderFilter.classes.real_male).toBe(true)
    expect(on.genderFilter.classes.anime_male).toBe(true)

    const off = settings(on, toggleBlurMale())
    expect(off.genderFilter.blurMale).toBe(false)
    expect(off.genderFilter.classes.real_male).toBe(false)
    expect(off.genderFilter.classes.anime_male).toBe(false)
  })

  it('handles SET_GENDER_CLASS for individual classes', () => {
    const initial: SettingsState = settings(undefined, { type: '@@INIT' } as any)
    expect(initial.genderFilter.classes.other).toBe(false)

    const withOther = settings(initial, setGenderClass('other', true))
    expect(withOther.genderFilter.classes.other).toBe(true)

    const withoutRealFemale = settings(withOther, setGenderClass('real_female', false))
    expect(withoutRealFemale.genderFilter.classes.real_female).toBe(false)
  })

  it('handles SET_GENDER_FILTER_SETTINGS', () => {
    const initial: SettingsState = settings(undefined, { type: '@@INIT' } as any)
    const custom: GenderFilterSettings = {
      enabled: true,
      blurFemale: false,
      blurMale: true,
      classes: {
        real_male: true,
        real_female: false,
        anime_male: true,
        anime_female: false,
        other: true
      }
    }

    const updated = settings(initial, setGenderFilterSettings(custom))
    expect(updated.genderFilter).toEqual(custom)
  })
})

describe('GenderClassifier inference logic', () => {
  const logger = new Logger()
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('exposes all 5 expected gender classes', () => {
    expect(GENDER_CLASSES).toEqual([
      'real_male',
      'real_female',
      'anime_male',
      'anime_female',
      'other'
    ])
  })

  it('throws error when predict is called before load', async () => {
    const classifier = new GenderClassifier(logger)
    const canvas = document.createElement('canvas')
    await expect(classifier.predict(canvas, DEFAULT_GENDER_SETTINGS)).rejects.toThrow('Gender model is not loaded')
  })

  it('correctly loads and evaluates shouldBlur when female is detected', async () => {
    const classifier = new GenderClassifier(logger)
    const loaded = await classifier.load()
    expect(loaded).toBe(true)

    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256

    // Mock returns anime_female
    const femaleEnabledSettings: GenderFilterSettings = {
      enabled: true,
      blurFemale: true,
      blurMale: false,
      classes: {
        real_male: false,
        real_female: true,
        anime_male: false,
        anime_female: true,
        other: false
      }
    }

    const pred = await classifier.predict(canvas, femaleEnabledSettings)
    expect(pred.predictedClass).toBe('anime_female')
    expect(pred.confidence).toBeCloseTo(0.75)
    expect(pred.shouldBlur).toBe(true)

    // When disabled, shouldBlur must be false
    const predDisabled = await classifier.predict(canvas, { ...femaleEnabledSettings, enabled: false })
    expect(predDisabled.shouldBlur).toBe(false)

    // When only male is blurred, shouldBlur must be false
    const maleOnlySettings: GenderFilterSettings = {
      enabled: true,
      blurFemale: false,
      blurMale: true,
      classes: {
        real_male: true,
        real_female: false,
        anime_male: true,
        anime_female: false,
        other: false
      }
    }
    const predMaleOnly = await classifier.predict(canvas, maleOnlySettings)
    expect(predMaleOnly.shouldBlur).toBe(false)
  })
})
