import type { ProviderId, ProviderModel } from './types'
import type { PinterestApiEnvironment } from '../providers/pinterest-api'

export interface ProviderConfiguration {
  apiKey: string
  primaryModel: string
  fallbackModel: string
}

export interface AutomationSettings {
  activeProvider: ProviderId
  providerConfigs: Record<ProviderId, ProviderConfiguration>
  modelCatalogs: Record<ProviderId, ProviderModel[]>
  dailyLimit: number
  batchSize: number
  minimumWindowHours: 8
  maximumWindowHours: 12
  disclosure: '#affiliate'
  boardName: string
  boardDescription: string
  researchKeywords: string[]
  researchUpdatedAt: number | null
  discoveryMaxPages: number
  productCategory: string
  productKeywords: string
  affiliateTags: string[]
  pinterestEnvironment: PinterestApiEnvironment
  pinterestOAuthWorkerUrl: string
  pinterestAccessToken: string
  pinterestRefreshToken: string
  pinterestTokenExpiresAt: number | null
  pinterestBoardId: string
  developerDryRun: boolean
}

const emptyProviderConfiguration = (): ProviderConfiguration => ({
  apiKey: '',
  primaryModel: '',
  fallbackModel: '',
})

export const DEFAULT_SETTINGS: AutomationSettings = {
  activeProvider: 'openrouter',
  providerConfigs: {
    openrouter: emptyProviderConfiguration(),
    openai: emptyProviderConfiguration(),
    gemini: emptyProviderConfiguration(),
  },
  modelCatalogs: {
    openrouter: [],
    openai: [],
    gemini: [],
  },
  dailyLimit: 100,
  batchSize: 10,
  minimumWindowHours: 8,
  maximumWindowHours: 12,
  disclosure: '#affiliate',
  boardName: '',
  boardDescription: '',
  researchKeywords: [],
  researchUpdatedAt: null,
  discoveryMaxPages: 3,
  productCategory: '',
  productKeywords: '',
  affiliateTags: [],
  pinterestEnvironment: 'sandbox',
  pinterestOAuthWorkerUrl: 'https://autopin-shopee-oauth.akurindowijayapwt.workers.dev',
  pinterestAccessToken: '',
  pinterestRefreshToken: '',
  pinterestTokenExpiresAt: null,
  pinterestBoardId: '',
  developerDryRun: true,
}

export function validateSettingsForStart(settings: AutomationSettings): string[] {
  const active = settings.providerConfigs[settings.activeProvider]
  const errors: string[] = []
  if (!active.apiKey.trim()) errors.push('api_key_required')
  if (!active.primaryModel.trim()) errors.push('primary_model_required')
  if (!settings.pinterestAccessToken.trim()) errors.push('pinterest_token_required')
  if (!/^\d+$/.test(settings.pinterestBoardId.trim())) errors.push('pinterest_board_id_required')
  errors.push(...validateAffiliateTags(settings.affiliateTags))
  return errors
}

export function validateAffiliateTags(tags: unknown): string[] {
  if (!Array.isArray(tags) || tags.length > 5) return ['affiliate_tags_limit']
  if (tags.some((tag) => typeof tag !== 'string' || !/^[A-Za-z0-9]+$/.test(tag))) return ['affiliate_tag_invalid']
  if (new Set(tags.map((tag: string) => tag.toLowerCase())).size !== tags.length) return ['affiliate_tag_duplicate']
  return []
}
