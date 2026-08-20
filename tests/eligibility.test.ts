import { describe, expect, it } from 'vitest'

import { evaluateEligibility, rankProducts } from '../src/core/eligibility'
import type { ProductCandidate } from '../src/core/types'

const baseProduct: ProductCandidate = {
  id: 'sku-1',
  title: 'Fast charging cable',
  canonicalUrl: 'https://shopee.co.id/product/1',
  price: 75_000,
  rating: 4.8,
  sold: 250,
  commissionPercent: 12,
  imageUrl: 'https://cf.shopee.co.id/file/example',
}

describe('evaluateEligibility', () => {
  it('accepts a product that satisfies every configured gate', () => {
    expect(evaluateEligibility(baseProduct)).toEqual({ eligible: true, reasons: [] })
  })

  it.each([
    ['rating', { rating: 4.69 }, 'rating_below_minimum'],
    ['sales', { sold: 99 }, 'sales_below_minimum'],
    ['commission', { commissionPercent: 9.99 }, 'commission_below_minimum'],
    ['price low', { price: 24_999 }, 'price_out_of_range'],
    ['price high', { price: 500_001 }, 'price_out_of_range'],
    ['image', { imageUrl: '' }, 'affiliate_image_missing'],
  ])('rejects an ineligible product because of %s', (_label, override, reason) => {
    const result = evaluateEligibility({ ...baseProduct, ...override })
    expect(result.eligible).toBe(false)
    expect(result.reasons).toContain(reason)
  })
})

describe('rankProducts', () => {
  it('ranks stronger balanced candidates first without changing eligibility gates', () => {
    const products: ProductCandidate[] = [
      baseProduct,
      { ...baseProduct, id: 'sku-2', rating: 4.9, sold: 900, commissionPercent: 16 },
      { ...baseProduct, id: 'sku-3', rating: 4.7, sold: 120, commissionPercent: 10 },
    ]

    expect(rankProducts(products).map((product) => product.id)).toEqual(['sku-2', 'sku-1', 'sku-3'])
  })
})
