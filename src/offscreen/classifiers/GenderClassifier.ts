import {
  browser,
  GraphModel,
  image as tfImage,
  loadGraphModel,
  Tensor,
  tidy
} from '@tensorflow/tfjs'

import { ILogger } from '../../utils/Logger'
import { getSkinToneRatio } from '../../utils/skinTone'
import { withTimeout } from '../../utils/withTimeout'
import { MODEL_LOAD_TIMEOUT, WARMUP_TIMEOUT } from './Classifier'

export type GenderClass = 'real_male' | 'real_female' | 'anime_male' | 'anime_female' | 'other'

export const GENDER_CLASSES: GenderClass[] = [
  'real_male',
  'real_female',
  'anime_male',
  'anime_female',
  'other'
]

export type GenderFilterSettings = {
  enabled: boolean
  blurFemale: boolean
  blurMale: boolean
  confidenceThreshold?: number
  classes: {
    real_male: boolean
    real_female: boolean
    anime_male: boolean
    anime_female: boolean
    other: boolean
  }
}

export const DEFAULT_GENDER_SETTINGS: GenderFilterSettings = {
  enabled: false,
  blurFemale: true,
  blurMale: false,
  confidenceThreshold: 50,
  classes: {
    real_male: false,
    real_female: true,
    anime_male: false,
    anime_female: true,
    other: false
  }
}

export type GenderPrediction = {
  predictedClass: GenderClass
  confidence: number
  probabilities: Record<GenderClass, number>
  shouldBlur: boolean
}

const MODEL_PATH = '../models/gender/model.json'
const INPUT_SIZE = 256

export class GenderClassifier {
  private readonly logger: ILogger
  private model: GraphModel | null = null

  constructor (logger: ILogger) {
    this.logger = logger
  }

  public async load (requireWarm = true): Promise<boolean> {
    try {
      this.model = await withTimeout(
        loadGraphModel(MODEL_PATH),
        MODEL_LOAD_TIMEOUT,
        'Gender model load'
      )
      const warmed = await this.warmUp()
      if (!warmed && requireWarm) {
        this.dispose()
        return false
      }
      this.logger.log('GenderClassifier TFJS GraphModel loaded and warmed up successfully')
      return true
    } catch (error) {
      this.logger.error(error as Error)
      return false
    }
  }

  private async warmUp (): Promise<boolean> {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = INPUT_SIZE
      canvas.height = INPUT_SIZE
      const probTensor = this.genderProbabilities(canvas)
      try {
        await withTimeout(probTensor.data(), WARMUP_TIMEOUT, 'Gender model warm-up')
      } finally {
        probTensor.dispose()
      }
      return true
    } catch (error) {
      this.logger.error(error as Error)
      return false
    }
  }

  private genderProbabilities (source: HTMLImageElement | HTMLCanvasElement): Tensor {
    return tidy(() => {
      const pixels = browser.fromPixels(source)
      const resized = tfImage.resizeBilinear(pixels, [INPUT_SIZE, INPUT_SIZE])
      const normalized = resized.toFloat().div(255.0).expandDims(0)
      return this.model?.predict(normalized) as Tensor
    })
  }

  public async predict (
    image: HTMLImageElement | HTMLCanvasElement,
    settings: GenderFilterSettings,
    url?: string
  ): Promise<GenderPrediction> {
    if (this.model === null) throw new Error('Gender model is not loaded')

    const startTime = performance.now()
    const probTensor = this.genderProbabilities(image)
    let output: Float32Array | Int32Array | Uint8Array
    try {
      output = await probTensor.data()
    } finally {
      probTensor.dispose()
    }

    const elapsed = (performance.now() - startTime).toFixed(1)

    let maxIdx = 0
    let maxProb = output[0]
    const probs = {} as Record<GenderClass, number>

    for (let i = 0; i < GENDER_CLASSES.length; i++) {
      const p = output[i]
      probs[GENDER_CLASSES[i]] = p
      if (p > maxProb) {
        maxProb = p
        maxIdx = i
      }
    }

    const predictedClass = GENDER_CLASSES[maxIdx]
    const confidence = maxProb
    const threshold = (settings.confidenceThreshold ?? 50) / 100

    const skinRatio = getSkinToneRatio(image)

    let finalClass = predictedClass
    let finalConfidence = confidence

    // Non-human creatures (aliens, monsters, robots, icons) have low human skin tones (< 18%).
    // Reclassify them as 'other' so that fantasy illustrations (like Ben 10 aliens)
    // are not falsely blurred under real/anime gender categories.
    if (skinRatio < 0.18 && predictedClass !== 'other') {
      finalClass = 'other'
      finalConfidence = Math.max(probs.other, 0.70)
    }

    let shouldBlur = false
    if (settings.enabled && finalConfidence >= threshold) {
      if (settings.blurFemale && (finalClass === 'real_female' || finalClass === 'anime_female')) {
        shouldBlur = true
      } else if (settings.blurMale && (finalClass === 'real_male' || finalClass === 'anime_male')) {
        shouldBlur = true
      } else if (settings.classes && settings.classes[finalClass]) {
        shouldBlur = true
      }
    }

    if (this.logger.status) {
      this.logger.log(`Gender prediction is ${finalClass} (original: ${predictedClass}, ${(finalConfidence * 100).toFixed(1)}%, skin: ${(skinRatio * 100).toFixed(1)}%) blur=${shouldBlur} (threshold=${(threshold * 100).toFixed(0)}%) in ${elapsed}ms for ${url ?? 'image'}`)
    }

    return {
      predictedClass: finalClass,
      confidence: finalConfidence,
      probabilities: probs,
      shouldBlur
    }
  }

  public dispose (): void {
    this.model?.dispose()
    this.model = null
  }
}
