import type { JobState, ProductSource, ProviderId } from '../core/types'

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
  source: ProductSource
  productId: string
  productTitle: string
  productUrl: string
  affiliateUrl: string
  provider: ProviderId
  model: string
  publishedAt: number
  contentFingerprint: string
  posterFingerprint: string
}
