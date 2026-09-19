import { describe, expect, it } from 'vitest'

import { extractShopeeCandidates, normalizeShopeeImageUrl, parseIndonesianCount, parseRupiah } from '../src/adapters/shopee-dom'

describe('Shopee DOM parsing', () => {
  it.each([
    ['99', 99],
    ['1,2RB', 1_200],
    ['3.4K', 3_400],
    ['2,5JT', 2_500_000],
  ])('parses localized count %s', (source, expected) => {
    expect(parseIndonesianCount(source)).toBe(expected)
  })

  it('parses Indonesian Rupiah formatting', () => {
    expect(parseRupiah('Rp 149.900')).toBe(149_900)
  })

  it('extracts candidate metrics from semantic affiliate product cards', () => {
    document.body.innerHTML = `
      <main>
        <article data-product-id="sku-123" data-testid="product-card">
          <a href="https://shopee.co.id/Kabel-Fast-Charging-i.10.20">Kabel Fast Charging 100W</a>
          <img src="https://cf.shopee.co.id/file/image-123" width="600" height="600" />
          <span>Rp75.000</span>
          <span>Rating 4,8</span>
          <span>250 Terjual</span>
          <span>Komisi 12%</span>
        </article>
      </main>
    `

    expect(extractShopeeCandidates(document)).toEqual([{
      source: 'shopee',
      id: 'sku-123',
      title: 'Kabel Fast Charging 100W',
      canonicalUrl: 'https://shopee.co.id/Kabel-Fast-Charging-i.10.20',
      price: 75_000,
      rating: 4.8,
      sold: 250,
      commissionPercent: 12,
      imageUrl: 'https://cf.shopee.co.id/file/image-123',
    }])
  })

  it('ignores cards without affiliate commission data', () => {
    document.body.innerHTML = `
      <article data-testid="product-card">
        <a href="https://shopee.co.id/Produk-i.10.21">Produk biasa</a>
        <img src="https://cf.shopee.co.id/file/image" />
        <span>Rp75.000</span><span>Rating 4,9</span><span>500 Terjual</span>
      </article>
    `
    expect(extractShopeeCandidates(document)).toEqual([])
  })

  it('supports ShopiThread offer cards with incomplete optional metrics and HD images', () => {
    document.body.innerHTML = `
      <div class="product-offer-item">
        <a href="https://affiliate.shopee.co.id/offer/product_offer/9988">
          <span class="ItemCard__name">Lampu Meja Minimalis</span>
        </a>
        <div class="ItemCard__image"><img src="https://down-id.img.susercontent.com/file/product@resize_w450_nl.webp?x=1" /></div>
        <span class="ItemCard__price">Rp 129.000</span>
        <span class="commRate">15%</span>
      </div>
    `

    expect(extractShopeeCandidates(document)).toEqual([expect.objectContaining({
      id: '9988',
      title: 'Lampu Meja Minimalis',
      price: 129_000,
      rating: 0,
      sold: 0,
      commissionPercent: 15,
      imageUrl: 'https://down-id.img.susercontent.com/file/product',
    })])
    expect(normalizeShopeeImageUrl('https://img.susercontent.com/a@resize_w100_nl.webp?q=1')).toBe('https://img.susercontent.com/a')
  })
})
