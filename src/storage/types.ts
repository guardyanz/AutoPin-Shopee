import type { JobState, ProviderId } from '../core/types'

export interface JobSnapshot {
  id: 'active'
  state: JobState
  queueProductIds: string[]
  activeProductId?: string
  scheduledSlots: number[]
  nextSlotIndex?: number
  completedToday: number
  consecutiveFailures: number
  updatedAt: number
}

export interface PublicationRecord {
  id: string
  productId: string
  productUrl: string
  affiliateUrl: string
  pinUrl: string
  boardName: string
  provider: ProviderId
  model: string
  publishedAt: number
  contentFingerprint: string
  posterFingerprint: string
}
