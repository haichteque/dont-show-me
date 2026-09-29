import { NSFWJS, PredictionType } from 'nsfwjs/core'

import { ILogger } from '../utils/Logger'
import { getSkinToneRatio } from '../utils/skinTone'

export type ModelSettings = {
  filterStrictness: number
}

type IModel = {
  predictImage: (image: HTMLImageElement, url: string) => Promise<boolean>
  setSettings: (settings: ModelSettings) => void
}

export class Model implements IModel {
  private readonly model: NSFWJS
  private readonly logger: ILogger

  private readonly FILTER_LIST: Set<string>
  private readonly firstFilterPercentages: Map<string, number>
  private readonly secondFilterPercentages: Map<string, number>

  constructor (model: NSFWJS, logger: ILogger, settings: ModelSettings) {
    this.model = model
    this.logger = logger

    this.logger.log('Model is loaded')

    this.FILTER_LIST = new Set(['Hentai', 'Porn', 'Sexy'])

    this.firstFilterPercentages = new Map()
    this.secondFilterPercentages = new Map()

    this.setSettings(settings)
  }

  public setSettings (settings: ModelSettings): void {
    const { filterStrictness } = settings
    this.firstFilterPercentages.clear()
    this.secondFilterPercentages.clear()

    for (const className of this.FILTER_LIST.values()) {
      this.firstFilterPercentages.set(
        className,
        Model.handleFilterStrictness({
          value: filterStrictness,
          maxValue: 100,
          minValue: className === 'Porn' ? 40 : 60
        })
      )
    }

    for (const className of this.FILTER_LIST.values()) {
      this.secondFilterPercentages.set(
        className,
        Model.handleFilterStrictness({
          value: filterStrictness,
          maxValue: 50,
          minValue: className === 'Porn' ? 15 : 25
        })
      )
    }
  }

  public async predictImage (image: HTMLImageElement, url: string): Promise<boolean> {
    const skinRatio = getSkinToneRatio(image)

    if (this.logger.status) {
      const start = new Date().getTime()

      const prediction = await this.model.classify(image, 2)
      const { result, className, probability } = this.handlePrediction(prediction, skinRatio)

      const end = new Date().getTime()
      this.logger.log(`IMG prediction (${end - start} ms) is ${className} ${probability} for ${url}`)

      return result
    } else {
      const prediction = await this.model.classify(image, 2)
      return this.handlePrediction(prediction, skinRatio).result
    }
  }

  private handlePrediction (prediction: PredictionType[], skinRatio = 0.5): { result: boolean, className: string, probability: number } {
    const [{ className: cn1, probability: pb1 }, { className: cn2, probability: pb2 }] = prediction

    // For images with low skin-tone coverage (< 20%) such as non-human aliens,
    // cartoons, and icons, require high confidence (> 0.94) and bypass secondary weak filters.
    if (skinRatio < 0.20) {
      const isExplicitPorn = cn1 === 'Porn' && pb1 > 0.85
      const isExplicitHentai = cn1 === 'Hentai' && pb1 > 0.94
      const result = isExplicitPorn || isExplicitHentai
      return ({ result, className: cn1, probability: pb1 })
    }

    // If the runner-up class is Drawing or Neutral (SFW classes), require high confidence (> 0.90) for Hentai.
    if (cn1 === 'Hentai' && (cn2 === 'Drawing' || cn2 === 'Neutral') && pb1 < 0.90) {
      return ({ result: false, className: cn1, probability: pb1 })
    }

    const result1 = this.FILTER_LIST.has(cn1) && pb1 > (this.firstFilterPercentages.get(cn1) as number)
    if (result1) return ({ result: result1, className: cn1, probability: pb1 })

    const result2 = this.FILTER_LIST.has(cn2) && pb2 > (this.secondFilterPercentages.get(cn2) as number)
    if (result2) return ({ result: result2, className: cn2, probability: pb2 })

    return ({ result: false, className: cn1, probability: pb1 })
  }

  public static handleFilterStrictness ({ value, minValue, maxValue }: {value: number, minValue: number, maxValue: number}): number {
    const MIN = minValue
    const MAX = maxValue

    const calc = (value: number): number => {
      if (value <= 1) return MAX
      else if (value >= 100) return MIN
      else {
        const coefficient = 1 - (value / 100)
        return (coefficient * (MAX - MIN)) + MIN
      }
    }

    return Math.round((calc(value) / 100) * 10000) / 10000
  }
}
