import { describe, expect, it } from 'vitest'

import { discoverShopeePages, findNextPageControl, isDisabled, productPageSignature } from '../src/adapters/shopee-pagination'

describe('Shopee affiliate pagination', () => {
  it('finds an enabled Ant Design next-page control', () => {
    document.body.innerHTML = '<ul><li class="ant-pagination-next"><button aria-label="Next Page">Next</button></li></ul>'
    const control = findNextPageControl(document)
    expect(control).not.toBeNull()
    expect(isDisabled(control!)).toBe(false)
  })

  it('does not use a disabled next-page control', () => {
    document.body.innerHTML = '<li class="ant-pagination-next ant-pagination-disabled" aria-disabled="true"></li>'
    const control = document.querySelector<HTMLElement>('.ant-pagination-next')!
    expect(isDisabled(control)).toBe(true)
  })

  it('builds a stable signature from page and product identifiers', () => {
    document.body.innerHTML = `
      <li class="ant-pagination-item-active">2</li>
      <article data-product-id="p-1" data-testid="product-card">
        <a href="https://shopee.co.id/Product-i.1.2">Produk</a>
        <img src="https://img.shopee.co.id/a" />
        <span>Rp50.000</span><span>Komisi 12%</span>
      </article>
    `
    expect(productPageSignature(document)).toBe('2:p-1')
  })

  it('enriches products on their source page and respects the product cap', async () => {
    document.body.innerHTML = `
      <article data-product-id="p-1" data-testid="product-card">
        <a href="https://shopee.co.id/Product-i.1.2">Produk</a>
        <img src="https://img.shopee.co.id/a" />
        <span>Rp50.000</span><span>Komisi 12%</span>
      </article>
      <article data-product-id="p-2" data-testid="product-card">
        <a href="https://shopee.co.id/Product-i.1.3">Produk 2</a>
        <img src="https://img.shopee.co.id/b" />
        <span>Rp60.000</span><span>Komisi 15%</span>
      </article>
    `

    const result = await discoverShopeePages(document, 3, 1, async (products) => (
      products.map((product) => ({ ...product, affiliateUrl: `https://s.shopee.co.id/${product.id}` }))
    ))

    expect(result.pagesScanned).toBe(1)
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].affiliateUrl).toBe('https://s.shopee.co.id/p-1')
  })
})
