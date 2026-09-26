import { GenderClass, GenderFilterSettings } from '../../../../offscreen/classifiers/GenderClassifier'
import { TrainedModel } from '../../../../utils/models'

import {
  TOGGLE_LOGGING,
  TOGGLE_DIV_FILTERING,
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
} from './settingsTypes'

export const toggleLogging = () => ({ type: TOGGLE_LOGGING } as const)
export const toggleDivFiltering = () => ({ type: TOGGLE_DIV_FILTERING } as const)
export const toggleEnabled = () => ({ type: TOGGLE_ENABLED } as const)

export const setFilterEffect = (filterEffect: 'hide' | 'blur' | 'grayscale') => ({
  type: SET_FILTER_EFFECT,
  payload: { filterEffect }
} as const)

export const setTrainedModel = (trainedModel: TrainedModel) => ({
  type: SET_TRAINED_MODEL,
  payload: { trainedModel }
} as const)

export const setFilterStrictness = (filterStrictness: number) => ({
  type: SET_FILTER_STRICTNESS,
  payload: { filterStrictness }
} as const)

export const setWebsiteList = (websites: string[]) => ({
  type: SET_WEBSITE_LIST,
  payload: { websites }
} as const)

export const toggleGenderFilter = () => ({ type: TOGGLE_GENDER_FILTER } as const)
export const toggleBlurFemale = () => ({ type: TOGGLE_BLUR_FEMALE } as const)
export const toggleBlurMale = () => ({ type: TOGGLE_BLUR_MALE } as const)

export const setGenderClass = (genderClass: GenderClass, value: boolean) => ({
  type: SET_GENDER_CLASS,
  payload: { genderClass, value }
} as const)

export const setGenderFilterSettings = (genderFilter: GenderFilterSettings) => ({
  type: SET_GENDER_FILTER_SETTINGS,
  payload: { genderFilter }
} as const)
