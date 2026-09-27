import { Checkbox, Segmented, Select, Slider, Switch } from 'antd'
import { ChevronDown, ChevronUp, Contrast, Droplet, EyeOff, Users } from 'lucide-react'
import React, { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'

import { DEFAULT_GENDER_SETTINGS } from '../../../offscreen/classifiers/GenderClassifier'
import { TRAINED_MODELS, TRAINED_MODEL_LABELS, TrainedModel } from '../../../utils/models'
import { setFilterStrictness } from '../../redux/actions/settings'
import {
  setTrainedModel,
  setFilterEffect,
  toggleEnabled,
  toggleLogging,
  toggleGenderFilter,
  toggleBlurFemale,
  toggleBlurMale,
  setGenderClass,
  setGenderConfidenceThreshold
} from '../../redux/actions/settings/index'
import { RootState } from '../../redux/reducers'
import { SettingsState } from '../../redux/reducers/settings'
import { StatisticsState } from '../../redux/reducers/statistics'

import { AllowSiteField } from './AllowSiteField'
import {
  Container,
  Stat,
  StatNumber,
  StatCaption,
  PowerRow,
  PowerText,
  PowerTitle,
  PowerHint,
  Card,
  Field,
  EffectField,
  FieldHead,
  FieldLabel,
  FieldValue,
  SliderEnds,
  ManageLink,
  AdvancedToggle,
  AdvancedPanel,
  AdvancedRow,
  GenderRow,
  GenderDetails,
  SubCheckboxGroup,
  MutedHint
} from './styles'

export const Production: React.FC = () => {
  const dispatch = useDispatch()
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [genderClassesOpen, setGenderClassesOpen] = useState(false)
  const settings = useSelector<RootState>((state) => state.settings) as SettingsState
  const {
    enabled,
    filterStrictness,
    trainedModel,
    filterEffect,
    logging
  } = settings
  const genderFilter = settings.genderFilter ?? DEFAULT_GENDER_SETTINGS
  const { totalBlocked } = useSelector<RootState>((state) => state.statistics) as StatisticsState

  return (
    <Container>
      <Stat>
        <StatNumber>{totalBlocked.toLocaleString()}</StatNumber>
        <StatCaption>images blocked</StatCaption>
      </Stat>

      <PowerRow>
        <PowerText>
          <PowerTitle>Protection</PowerTitle>
          <PowerHint>{enabled ? 'On' : 'Paused'}</PowerHint>
        </PowerText>
        <Switch checked={enabled} onChange={() => dispatch(toggleEnabled())} />
      </PowerRow>

      <Card>
        <Field>
          <FieldHead>
            <FieldLabel>Filter strictness</FieldLabel>
            <FieldValue>{filterStrictness}%</FieldValue>
          </FieldHead>
          <Slider
            min={1}
            max={100}
            value={filterStrictness}
            tooltip={{ open: false }}
            onChange={(value: number) => dispatch(setFilterStrictness(value))}
          />
          <SliderEnds>
            <span>Lenient</span>
            <span>Strict</span>
          </SliderEnds>
        </Field>

        <EffectField>
          <FieldLabel>Filter effect</FieldLabel>
          <Segmented<'blur' | 'grayscale' | 'hide'>
            block
            style={{ marginTop: 8 }}
            value={filterEffect}
            onChange={value => dispatch(setFilterEffect(value))}
            options={[
              { label: 'Blur', value: 'blur', icon: <Droplet size={14} /> },
              { label: 'Gray', value: 'grayscale', icon: <Contrast size={14} /> },
              { label: 'Hide', value: 'hide', icon: <EyeOff size={14} /> }
            ]}
          />
        </EffectField>

        <AllowSiteField />
        <ManageLink onClick={() => chrome.runtime.openOptionsPage()}>
          Manage allowed sites
        </ManageLink>
      </Card>

      <Card>
        <GenderRow>
          <FieldLabel style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={15} />
            Gender filter
          </FieldLabel>
          <Switch
            checked={genderFilter.enabled}
            onChange={() => dispatch(toggleGenderFilter())}
          />
        </GenderRow>

        {genderFilter.enabled && (
          <GenderDetails>
            <MutedHint>
              Blurs safe images matching selected genders after NSFW detection.
            </MutedHint>

            <Checkbox
              checked={genderFilter.blurFemale}
              onChange={() => dispatch(toggleBlurFemale())}
            >
              Blur Females (real &amp; anime)
            </Checkbox>

            <Checkbox
              checked={genderFilter.blurMale}
              onChange={() => dispatch(toggleBlurMale())}
            >
              Blur Males (real &amp; anime)
            </Checkbox>

            <Field style={{ marginTop: 8, marginBottom: 4 }}>
              <FieldHead>
                <FieldLabel style={{ fontSize: 13 }}>Confidence threshold</FieldLabel>
                <FieldValue>{genderFilter.confidenceThreshold ?? 50}%</FieldValue>
              </FieldHead>
              <Slider
                min={20}
                max={95}
                value={genderFilter.confidenceThreshold ?? 50}
                tooltip={{ open: false }}
                onChange={(value: number) => dispatch(setGenderConfidenceThreshold(value))}
              />
              <SliderEnds>
                <span>Sensitive</span>
                <span>Strict</span>
              </SliderEnds>
            </Field>

            <div>
              <AdvancedToggle
                aria-expanded={genderClassesOpen}
                onClick={() => setGenderClassesOpen(open => !open)}
                style={{ fontSize: 12, marginTop: 2 }}
              >
                {genderClassesOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                Customize individual classes
              </AdvancedToggle>

              {genderClassesOpen && (
                <SubCheckboxGroup style={{ marginTop: 6 }}>
                  <Checkbox
                    checked={genderFilter.classes.real_female}
                    onChange={e => dispatch(setGenderClass('real_female', e.target.checked))}
                  >
                    Real Female
                  </Checkbox>
                  <Checkbox
                    checked={genderFilter.classes.anime_female}
                    onChange={e => dispatch(setGenderClass('anime_female', e.target.checked))}
                  >
                    Anime Female
                  </Checkbox>
                  <Checkbox
                    checked={genderFilter.classes.real_male}
                    onChange={e => dispatch(setGenderClass('real_male', e.target.checked))}
                  >
                    Real Male
                  </Checkbox>
                  <Checkbox
                    checked={genderFilter.classes.anime_male}
                    onChange={e => dispatch(setGenderClass('anime_male', e.target.checked))}
                  >
                    Anime Male
                  </Checkbox>
                  <Checkbox
                    checked={genderFilter.classes.other}
                    onChange={e => dispatch(setGenderClass('other', e.target.checked))}
                  >
                    Other
                  </Checkbox>
                </SubCheckboxGroup>
              )}
            </div>
          </GenderDetails>
        )}
      </Card>

      <div>
        <AdvancedToggle
          aria-expanded={advancedOpen}
          aria-controls="advanced-panel"
          onClick={() => setAdvancedOpen(open => !open)}
        >
          {advancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          Advanced
        </AdvancedToggle>
        {advancedOpen && (
          <AdvancedPanel id="advanced-panel">
            <AdvancedRow>
              <FieldLabel>Trained model</FieldLabel>
              <Select<TrainedModel>
                value={trainedModel}
                style={{ width: 170 }}
                onChange={value => dispatch(setTrainedModel(value))}
                options={TRAINED_MODELS.map(value => ({ value, label: TRAINED_MODEL_LABELS[value] }))}
              />
            </AdvancedRow>
            <Checkbox checked={logging} onChange={() => dispatch(toggleLogging())}>
              Show logs in browser console
            </Checkbox>
          </AdvancedPanel>
        )}
      </div>
    </Container>
  )
}
