import type { ProductSource, ProviderId, ProviderModel } from './types'
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
  dailyLimit: 10
  minimumWindowHours: 8
  maximumWindowHours: 12
  disclosure: '#affiliate'
  boardName: string
  boardDescription: string
  researchKeywords: string[]
  researchUpdatedAt: number | null
  discoveryMaxPages: number
  productSource: ProductSource
  amazonServiceUrl: string
  amazonServiceToken: string
  amazonMarketplace: string
  amazonPartnerTag: string
  amazonAsin: string
  amazonOriginalImageDataUrl: string
  amazonOriginalImageName: string
  amazonRightsConfirmed: boolean
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
  dailyLimit: 10,
  minimumWindowHours: 8,
  maximumWindowHours: 12,
  disclosure: '#affiliate',
  boardName: '',
  boardDescription: '',
  researchKeywords: [],
  researchUpdatedAt: null,
  discoveryMaxPages: 3,
  productSource: 'shopee',
  amazonServiceUrl: '',
  amazonServiceToken: '',
  amazonMarketplace: 'www.amazon.com',
  amazonPartnerTag: '',
  amazonAsin: '',
  amazonOriginalImageDataUrl: '',
  amazonOriginalImageName: '',
  amazonRightsConfirmed: false,
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
  if (settings.productSource === 'amazon') {
    if (!isAllowedAmazonServiceUrl(settings.amazonServiceUrl)) errors.push('amazon_service_url_required')
    if (settings.amazonServiceToken.trim().length < 32) errors.push('amazon_service_token_required')
    if (!AMAZON_MARKETPLACES.includes(settings.amazonMarketplace as typeof AMAZON_MARKETPLACES[number])) errors.push('amazon_marketplace_invalid')
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{1,63}$/.test(settings.amazonPartnerTag.trim())) errors.push('amazon_partner_tag_required')
    if (!/^[A-Z0-9]{10}$/.test(settings.amazonAsin.trim().toUpperCase())) errors.push('amazon_asin_required')
    if (settings.amazonOriginalImageDataUrl && !/^data:image\/(?:png|jpeg|webp);base64,/i.test(settings.amazonOriginalImageDataUrl)) errors.push('amazon_owned_image_invalid')
    if (settings.amazonOriginalImageDataUrl && !settings.amazonRightsConfirmed) errors.push('amazon_image_rights_required')
  }
  return errors
}

export const AMAZON_MARKETPLACES = [
  'www.amazon.com',
  'www.amazon.ca',
  'www.amazon.com.mx',
  'www.amazon.com.br',
  'www.amazon.co.uk',
  'www.amazon.de',
  'www.amazon.fr',
  'www.amazon.it',
  'www.amazon.es',
  'www.amazon.nl',
  'www.amazon.com.be',
  'www.amazon.ie',
  'www.amazon.pl',
  'www.amazon.se',
  'www.amazon.com.tr',
  'www.amazon.eg',
  'www.amazon.in',
  'www.amazon.sa',
  'www.amazon.ae',
  'www.amazon.co.jp',
  'www.amazon.sg',
  'www.amazon.com.au',
] as const

function isAllowedAmazonServiceUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
      && url.pathname === '/'
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
  } catch {
    return false
  }
}
