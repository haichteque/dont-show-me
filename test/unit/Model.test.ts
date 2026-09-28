import { Model } from '../../src/background/Model'
import { Logger } from '../../src/utils/Logger'

describe('background => Model => handleFilterStrictness', () => {
    const data = [
        { value: 1, expected: 0.98 },
        { value: 100, expected: 0.4 },
        { value: 30, expected: 0.806 },
        { value: 70, expected: 0.574 },
        { value: 50, expected: 0.69 },
    ]

    test.each(data)(`Handle model filter strictness correctly %s`, (_data) => {
        const minValue = 40
        const maxValue = 98
        const { value, expected } = _data
        expect(Model.handleFilterStrictness({ value, minValue, maxValue })).toBe(expected)
    })
})

describe('background => Model => handlePrediction safeguards', () => {
    const mockModel: any = { classify: jest.fn() }
    const logger = new Logger()
    const model = new Model(mockModel, logger, { filterStrictness: 55 })

    test('protects alien cartoon images with low skin tone (< 20%) from Hentai false positives', () => {
        // e.g. Spidermonkey has skinRatio ~0.05 and Hentai ~0.908
        const prediction = [
            { className: 'Hentai', probability: 0.91 },
            { className: 'Neutral', probability: 0.05 }
        ] as any
        const res = (model as any).handlePrediction(prediction, 0.05)
        expect(res.result).toBe(false)
    })

    test('still blocks explicit Hentai with low skin tone if probability is extremely high (> 0.94)', () => {
        const prediction = [
            { className: 'Hentai', probability: 0.96 },
            { className: 'Neutral', probability: 0.02 }
        ] as any
        const res = (model as any).handlePrediction(prediction, 0.05)
        expect(res.result).toBe(true)
    })

    test('still blocks explicit Porn with low skin tone if probability is high (> 0.85)', () => {
        const prediction = [
            { className: 'Porn', probability: 0.89 },
            { className: 'Neutral', probability: 0.05 }
        ] as any
        const res = (model as any).handlePrediction(prediction, 0.05)
        expect(res.result).toBe(true)
    })

    test('protects drawings where runner-up is Drawing or Neutral and Hentai < 0.90', () => {
        // e.g. Swampfire has skinRatio ~0.16 and Hentai ~0.83 with Drawing runner-up
        const prediction = [
            { className: 'Hentai', probability: 0.83 },
            { className: 'Drawing', probability: 0.15 }
        ] as any
        const res = (model as any).handlePrediction(prediction, 0.16)
        expect(res.result).toBe(false)
    })

    test('blocks explicit porn on normal images with typical human skin tone (> 20%)', () => {
        const prediction = [
            { className: 'Porn', probability: 0.80 },
            { className: 'Neutral', probability: 0.10 }
        ] as any
        const res = (model as any).handlePrediction(prediction, 0.35)
        expect(res.result).toBe(true)
    })
})

