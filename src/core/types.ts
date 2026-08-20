export type ProviderId = 'openrouter' | 'openai' | 'gemini'

export interface ProductCandidate {
  id: string
  title: string
  canonicalUrl: string
  price: number
  rating: number
  sold: number
  commissionPercent: number
  imageUrl: string
  description?: string
  affiliateUrl?: string
}

export interface EligibilityRules {
  minimumRating: number
  minimumSales: number
  minimumCommissionPercent: number
  minimumPrice: number
  maximumPrice: number
}

export type EligibilityReason =
  | 'rating_below_minimum'
  | 'sales_below_minimum'
  | 'commission_below_minimum'
  | 'price_out_of_range'
  | 'affiliate_image_missing'

export interface GeneratedPinContent {
  pinTitle: string
  pinDescription: string
  altText: string
  keywords: string[]
  layoutDirection: {
    headline: string
    visualTone: string
    accentPreference: string
  }
}

export interface ProviderModel {
  id: string
  label: string
  provider: ProviderId
}

export type JobState =
  | 'idle'
  | 'preflight'
  | 'research_due_check'
  | 'discover_products'
  | 'select_candidate'
  | 'extract_product'
  | 'generate_affiliate_link'
  | 'generate_copy'
  | 'render_poster'
  | 'await_publish_slot'
  | 'fill_pinterest'
  | 'publish_pinterest'
  | 'verify_publication'
  | 'commit_result'
  | 'cleanup'
  | 'paused'
  | 'daily_limit_reached'
  | 'authentication_required'
  | 'captcha_detected'
  | 'circuit_open'
  | 'stopped'
