import { describe, expect, it } from 'vitest'

import {
  detectShopeePageState,
  extractAffiliateLink,
  extractAffiliateLinks,
  extractShopeeProductDetail,
} from '../src/adapters/shopee-detail'
import type { ProductCandidate } from '../src/core/types'

const candidate: ProductCandidate = {
  id: 'sku-123',
  title: 'Kabel Fast Charging',
  canonicalUrl: 'https://shopee.co.id/Kabel-i.10.20',
  price: 75_000,
  rating: 4.8,
  sold: 250,
  commissionPercent: 12,
  imageUrl: 'https://cf.shopee.co.id/file/list-image',
}

describe('Shopee product detail adapter', () => {
  it('detects authentication and CAPTCHA safety stops', () => {
    document.body.innerHTML = '<input type="password"><button>Log in</button>'
    expect(detectShopeePageState(document)).toBe('authentication_required')

    document.body.innerHTML = '<main>Verifikasi untuk melanjutkan CAPTCHA</main>'
    expect(detectShopeePageState(document)).toBe('captcha_detected')

    document.body.innerHTML = '<main><h1>Penawaran Produk</h1></main>'
    expect(detectShopeePageState(document)).toBe('ready')
  })

  it('enriches a candidate with visible description and the highest-resolution affiliate image', () => {
    document.body.innerHTML = `
      <h1>Kabel Fast Charging 100W</h1>
      <section data-testid="product-description">Kabel nilon dengan konektor USB-C untuk pengisian daya.</section>
      <img src="https://cf.shopee.co.id/file/small" width="200" height="200">
      <img src="https://cf.shopee.co.id/file/large" width="1000" height="1000">
    `
    expect(extractShopeeProductDetail(document, candidate)).toMatchObject({
      title: 'Kabel Fast Charging 100W',
      description: 'Kabel nilon dengan konektor USB-C untuk pengisian daya.',
      imageUrl: 'https://cf.shopee.co.id/file/large',
    })
  })

  it('extracts only a Shopee affiliate URL', () => {
    document.body.innerHTML = `
      <input value="https://s.shopee.co.id/affiliate-code">
      <a href="https://example.com/not-affiliate">Other</a>
    `
    expect(extractAffiliateLink(document)).toBe('https://s.shopee.co.id/affiliate-code')
  })

  it('returns every unique affiliate URL so stale links can be excluded', () => {
    document.body.innerHTML = `
      <input value="https://s.shopee.co.id/old-code">
      <a href="https://s.shopee.co.id/new-code">New</a>
      <a href="https://s.shopee.co.id/new-code">Duplicate</a>
      <a href="https://example.com/not-affiliate">Other</a>
    `
    expect(extractAffiliateLinks(document)).toEqual([
      'https://s.shopee.co.id/old-code',
      'https://s.shopee.co.id/new-code',
    ])
  })
})
