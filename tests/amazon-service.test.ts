import { afterEach, describe, expect, it, vi } from 'vitest'

import { AmazonServiceClient, AmazonServiceError } from '../src/providers/amazon-service'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AmazonServiceClient', () => {
  it('checks backend health', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })))

    const client = new AmazonServiceClient('https://amazon-service.example.com/', 'a-secure-service-token-1234567890')
    await expect(client.health()).resolves.toEqual({ status: 'ok' })
  })

  it('maps a Creators API response without importing a catalog image', async () => {
    const specialLink = 'https://www.amazon.com/dp/B0ABC12345?tag=example-20'
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        item: {
          asin: 'B0ABC12345',
          title: 'Compact desk lamp',
          detail_page_url: specialLink,
        },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    const client = new AmazonServiceClient('https://amazon-service.example.com/', 'a-secure-service-token-1234567890')
    const product = await client.lookupProduct({
      asin: 'B0ABC12345',
      marketplace: 'www.amazon.com',
      partnerTag: 'example-20',
    })

    expect(product).toMatchObject({
      source: 'amazon',
      sourceId: 'B0ABC12345',
      affiliateUrl: specialLink,
      imageUrl: '',
    })
    expect(fetchMock).toHaveBeenCalledWith('https://amazon-service.example.com/v1/product-lookups', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer a-secure-service-token-1234567890' }),
    }))
  })

  it('rejects a product URL outside the selected Amazon marketplace', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: {
        item: {
          asin: 'B0ABC12345',
          title: 'Compact desk lamp',
          detail_page_url: 'https://evil.example/product',
        },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })))

    const client = new AmazonServiceClient('https://amazon-service.example.com/', 'a-secure-service-token-1234567890')
    await expect(client.lookupProduct({
      asin: 'B0ABC12345',
      marketplace: 'www.amazon.com',
      partnerTag: 'example-20',
    })).rejects.toMatchObject({ code: 'amazon_response_invalid' } satisfies Partial<AmazonServiceError>)
  })
})
