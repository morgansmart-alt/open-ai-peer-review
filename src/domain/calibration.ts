/** Reference band for the v8 paper, from the gemini-3.8-flash full-text runs on 20 Nov 2026. */
export const REFERENCE_MEDIAN = 72.5

export interface ModelCalibration {
  model: string
  passed: boolean
  date: string
  source: string
  observed?: number
  verdictInBand?: boolean
}

export const MODEL_CALIBRATIONS: ModelCalibration[] = [
  {
    model: "gemini-3.8-flash",
    passed: true,
    date: "2026-11-20",
    source: "v8 full-text runs 70.53, 71.76 and 75.3, verdict revise, within 10 of the reference median",
    observed: 72.5,
    verdictInBand: true,
  },
  {
    model: "gemini-3.6-flash",
    passed: false,
    date: "2026-11-20",
    source: "v8 full-text runs scored 11 to 13 points above the reference median",
    observed: 83.18,
    verdictInBand: false,
  },
]

export function calibrationFor(modelId: string): ModelCalibration | undefined {
  return MODEL_CALIBRATIONS.find((item) => modelId.includes(item.model))
}

export function isCalibratedForFullReview(modelId: string): boolean {
  return calibrationFor(modelId)?.passed === true
}

export function passesReferenceBand(observed: number, verdict: string, expectedVerdict: string, median = REFERENCE_MEDIAN): boolean {
  return Math.abs(observed - median) <= 10 && verdict === expectedVerdict
}
