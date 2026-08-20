import type { GeneratedPinContent, JobState, ProductCandidate, ProviderId } from './types'

export interface RuntimeStatus {
  state: JobState
  message: string
  activeProductTitle?: string
  completedToday: number
  dailyLimit: number
  nextRunAt?: number
  lastError?: string
  updatedAt: number
}

export interface ActivityEntry {
  id: string
  level: 'info' | 'success' | 'warning' | 'error'
  message: string
  stage: JobState
  timestamp: number
}

export interface RuntimePayload {
  activeProduct?: ProductCandidate
  generatedContent?: GeneratedPinContent
  posterDataUrl?: string
  pinUrl?: string
  publicationConfirmed?: boolean
  provider?: ProviderId
  model?: string
}

export const DEFAULT_RUNTIME_STATUS: RuntimeStatus = {
  state: 'idle',
  message: 'Ready to run preflight',
  completedToday: 0,
  dailyLimit: 10,
  updatedAt: Date.now(),
}
