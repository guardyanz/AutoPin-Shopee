import type { ProductCandidate } from '../core/types'

export interface AmazonProductLookup {
  asin: string
  marketplace: string
  partnerTag: string
  originalImageDataUrl?: string
}

interface AmazonServiceEnvelope {
  data?: {
    item?: {
      asin?: unknown
      title?: unknown
      detail_page_url?: unknown
    }
  }
  error?: {
    code?: unknown
    message?: unknown
  }
}

export class AmazonServiceClient {
  private readonly baseUrl: string

  constructor(baseUrl: string, private readonly serviceToken: string) {
    this.baseUrl = validateAmazonServiceUrl(baseUrl)
    if (serviceToken.trim().length < 32) throw new AmazonServiceError('amazon_service_token_invalid', 'Amazon service token must contain at least 32 characters')
  }

  async health(): Promise<{ status: string }> {
    const response = await fetch(`${this.baseUrl}/health`, { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new AmazonServiceError('amazon_service_unavailable', `Amazon service health check returned HTTP ${response.status}`)
    const payload = await response.json() as { status?: unknown }
    if (payload.status !== 'ok') throw new AmazonServiceError('amazon_service_unhealthy', 'Amazon service did not report a healthy status')
    return { status: 'ok' }
  }

  async lookupProduct(input: AmazonProductLookup): Promise<ProductCandidate> {
    const response = await fetch(`${this.baseUrl}/v1/product-lookups`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${this.serviceToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        asin: input.asin,
        marketplace: input.marketplace,
        partner_tag: input.partnerTag,
      }),
    })
    const payload = await parseEnvelope(response)
    if (!response.ok) {
      throw new AmazonServiceError(
        typeof payload.error?.code === 'string' ? payload.error.code : 'amazon_service_error',
        typeof payload.error?.message === 'string' ? payload.error.message : `Amazon service returned HTTP ${response.status}`,
      )
    }
    const item = payload.data?.item
    const asin = typeof item?.asin === 'string' ? item.asin.trim().toUpperCase() : ''
    const title = typeof item?.title === 'string' ? item.title.trim() : ''
    const detailPageUrl = typeof item?.detail_page_url === 'string' ? item.detail_page_url.trim() : ''
    if (!/^[A-Z0-9]{10}$/.test(asin) || !title || !isAmazonDetailUrl(detailPageUrl, input.marketplace)) {
      throw new AmazonServiceError('amazon_response_invalid', 'Amazon service returned an invalid product payload')
    }
    return {
      source: 'amazon',
      id: `amazon:${input.marketplace}:${asin}`,
      sourceId: asin,
      marketplace: input.marketplace,
      title,
      canonicalUrl: detailPageUrl,
      affiliateUrl: detailPageUrl,
      price: 0,
      rating: 0,
      sold: 0,
      commissionPercent: 0,
      imageUrl: input.originalImageDataUrl ?? '',
      description: 'Amazon product selected by the account owner through Creators API.',
    }
  }
}

async function parseEnvelope(response: Response): Promise<AmazonServiceEnvelope> {
  try {
    return await response.json() as AmazonServiceEnvelope
  } catch {
    throw new AmazonServiceError('amazon_service_response_invalid', 'Amazon service returned a non-JSON response')
  }
}

export function validateAmazonServiceUrl(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new AmazonServiceError('amazon_service_url_invalid', 'Enter a valid Amazon service URL')
  }
  const localDevelopment = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)
  if ((!localDevelopment && url.protocol !== 'https:') || url.pathname !== '/' || url.username || url.password || url.search || url.hash) {
    throw new AmazonServiceError('amazon_service_url_invalid', 'Amazon service must use a root HTTPS URL, except localhost development')
  }
  return url.toString().replace(/\/$/, '')
}

function isAmazonDetailUrl(value: string, marketplace: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && (url.hostname === marketplace || url.hostname.endsWith(`.${marketplace}`))
  } catch {
    return false
  }
}

export class AmazonServiceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'AmazonServiceError'
  }
}
