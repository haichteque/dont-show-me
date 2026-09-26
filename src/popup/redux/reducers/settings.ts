
import { DEFAULT_GENDER_SETTINGS, GenderFilterSettings } from '../../../offscreen/classifiers/GenderClassifier'
import { DEFAULT_TRAINED_MODEL, isTrainedModel, TrainedModel } from '../../../utils/models'
import { SettingsActionTypes } from '../actions/settings'
import {
  TOGGLE_LOGGING,
  TOGGLE_ENABLED,
  SET_FILTER_EFFECT,
  SET_TRAINED_MODEL,
  SET_FILTER_STRICTNESS,
  SET_WEBSITE_LIST,
  TOGGLE_GENDER_FILTER,
  TOGGLE_BLUR_FEMALE,
  TOGGLE_BLUR_MALE,
  SET_GENDER_CLASS,
  SET_GENDER_FILTER_SETTINGS
} from '../actions/settings/settingsTypes'

export type SettingsState = {
  enabled: boolean
  logging: boolean
  filterEffect: 'hide' | 'blur' | 'grayscale'
  trainedModel: TrainedModel
  filterStrictness: number
  websites: string[]
  genderFilter: GenderFilterSettings
}

const initialState: SettingsState = {
  enabled: true,
  logging: process.env.NODE_ENV === 'development',
  filterEffect: 'blur',
  trainedModel: DEFAULT_TRAINED_MODEL,
  filterStrictness: 55,
  websites: [],
  genderFilter: DEFAULT_GENDER_SETTINGS
}

export function settings (state = initialState, action: SettingsActionTypes): SettingsState {
  // Persisted state from an older version may be missing keys added later (e.g.
  // `enabled` or `genderFilter`). reduxed-chrome-storage hydrates from storage as-is,
  // so backfill defaults; otherwise a missing key reads as undefined.
  const hydrated = (state as Partial<SettingsState>).enabled !== undefined
  let s = hydrated ? state : { ...initialState, ...state }
  if (!s.genderFilter) s = { ...s, genderFilter: DEFAULT_GENDER_SETTINGS }
  // A model removed in a later version (or a downgrade) would leave an id the
  // offscreen document can't load; reset it so classification never wedges.
  if (!isTrainedModel(s.trainedModel)) s = { ...s, trainedModel: DEFAULT_TRAINED_MODEL }
  switch (action.type) {
    case TOGGLE_ENABLED:
      return { ...s, enabled: !s.enabled }
    case TOGGLE_LOGGING:
      return { ...s, logging: !s.logging }
    case SET_FILTER_EFFECT:
      return { ...s, filterEffect: action.payload.filterEffect }
    case SET_TRAINED_MODEL:
      return { ...s, trainedModel: action.payload.trainedModel }
    case SET_FILTER_STRICTNESS:
      return { ...s, filterStrictness: action.payload.filterStrictness }
    case SET_WEBSITE_LIST:
      return { ...s, websites: action.payload.websites }
    case TOGGLE_GENDER_FILTER:
      return {
        ...s,
        genderFilter: { ...s.genderFilter, enabled: !s.genderFilter.enabled }
      }
    case TOGGLE_BLUR_FEMALE: {
      const nextFemale = !s.genderFilter.blurFemale
      return {
        ...s,
        genderFilter: {
          ...s.genderFilter,
          blurFemale: nextFemale,
          classes: {
            ...s.genderFilter.classes,
            real_female: nextFemale,
            anime_female: nextFemale
          }
        }
      }
    }
    case TOGGLE_BLUR_MALE: {
      const nextMale = !s.genderFilter.blurMale
      return {
        ...s,
        genderFilter: {
          ...s.genderFilter,
          blurMale: nextMale,
          classes: {
            ...s.genderFilter.classes,
            real_male: nextMale,
            anime_male: nextMale
          }
        }
      }
    }
    case SET_GENDER_CLASS:
      return {
        ...s,
        genderFilter: {
          ...s.genderFilter,
          classes: {
            ...s.genderFilter.classes,
            [action.payload.genderClass]: action.payload.value
          }
        }
      }
    case SET_GENDER_FILTER_SETTINGS:
      return { ...s, genderFilter: action.payload.genderFilter }
    default:
      return s
  }
}

