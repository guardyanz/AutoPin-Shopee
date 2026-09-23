import type { GeneratedPinContent, JobState, ProductCandidate, ProviderId } from '../core/types'

export interface JobSnapshot {
  id: 'active'
  state: JobState
  queueProductIds: string[]
  draftProductIds?: string[]
  reviewedProductIds?: string[]
  approvedProductIds?: string[]
  pausedFrom?: JobState
  publishOutcomeAmbiguous?: boolean
  activeProductId?: string
  scheduledSlots: number[]
  nextSlotIndex?: number
  completedToday: number
  consecutiveFailures: number
  updatedAt: number
}

export interface PinDraft {
  id: string
  product: ProductCandidate
  content: GeneratedPinContent
  posterDataUrl: string
  provider: ProviderId
  model: string
  boardId: string
  boardLabel: string
  createdAt: number
}

export interface PublicationRecord {
  id: string
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
