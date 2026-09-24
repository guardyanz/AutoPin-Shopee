import { describe, expect, it } from 'vitest'

import { discoverShopeePage, findNextPageControl, isDisabled, productPageSignature } from '../src/adapters/shopee-pagination'

describe('Shopee affiliate pagination', () => {
  it('finds an enabled Ant Design next-page control', () => {
    document.body.innerHTML = '<ul><li class="ant-pagination-next"><button aria-label="Next Page">Next</button></li></ul>'
    const control = findNextPageControl(document)
    expect(control).not.toBeNull()
    expect(isDisabled(control!)).toBe(false)
  })

  it('recognizes a text-only next arrow inside Shopee-style pagination', () => {
    document.body.innerHTML = '<nav class="pagination"><button>6</button><button aria-current="page">7</button><button>›</button></nav>'
    expect(findNextPageControl(document)?.textContent).toBe('›')
  })

  it('does not use a disabled next-page control', () => {
    document.body.innerHTML = '<li class="ant-pagination-next ant-pagination-disabled" aria-disabled="true"></li>'
    const control = document.querySelector<HTMLElement>('.ant-pagination-next')!
    expect(isDisabled(control)).toBe(true)
  })

  it('treats an arrow inside a disabled pagination item as disabled', () => {
    document.body.innerHTML = '<nav class="pagination"><li class="page-next disabled"><button>›</button></li></nav>'
    expect(isDisabled(document.querySelector('button')!)).toBe(true)
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

    const result = await discoverShopeePage(document, 1, async (products) => (
      products.map((product) => ({ ...product, affiliateUrl: `https://s.shopee.co.id/${product.id}` }))
    ))

    expect(result.pagesScanned).toBe(1)
    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].affiliateUrl).toBe('https://s.shopee.co.id/p-1')
  })

  it('keeps advancing beyond ten pages without asking the user to resume', async () => {
    let currentPage = 1
    const renderPage = () => {
      document.body.innerHTML = `
        <article data-product-id="p-${currentPage}" data-testid="product-card">
          <a href="https://shopee.co.id/Product-i.1.${currentPage}">Produk ${currentPage}</a>
          <img src="https://img.shopee.co.id/${currentPage}" />
          <span>Rp50.000</span><span>Komisi 12%</span>
        </article>
        <ul><li class="ant-pagination-item-active">${currentPage}</li>
          <li class="ant-pagination-next ${currentPage === 12 ? 'ant-pagination-disabled' : ''}">
            <button ${currentPage === 12 ? 'disabled' : ''} aria-label="Next Page">Next</button>
          </li>
        </ul>`
      document.querySelector('button')!.addEventListener('click', () => {
        currentPage += 1
        renderPage()
      })
    }
    renderPage()
    const collected: string[] = []
    let previousSignature: string | undefined
    let result
    do {
      result = await discoverShopeePage(document, 1, async (products) => products, previousSignature, collected)
      collected.push(...result.candidates.map((candidate) => candidate.id))
      previousSignature = result.pageSignature
    } while (result.hasNextPage)

    expect(collected).toHaveLength(12)
    expect(collected.at(-1)).toBe('p-12')
    expect(currentPage).toBe(12)
  })

  it('recovers a reloaded source tab without reprocessing saved products', async () => {
    document.body.innerHTML = `
      <article data-product-id="p-1" data-testid="product-card">
        <a href="https://shopee.co.id/Product-i.1.1">Produk 1</a>
        <img src="https://img.shopee.co.id/1" />
        <span>Rp50.000</span><span>Komisi 12%</span>
      </article>
      <nav class="pagination"><button aria-current="page">1</button><button>›</button></nav>
    `
    const result = await discoverShopeePage(document, 10, async (products) => products, '7:p-7', ['p-1'])
    expect(result.candidates).toEqual([])
    expect(result.pageSignature).toBe('1:p-1')
    expect(result.hasNextPage).toBe(true)
  })

  it('keeps the unprocessed products on the same page available for a later chunk', async () => {
    document.body.innerHTML = [1, 2, 3].map((number) => `
      <article data-product-id="p-${number}" data-testid="product-card">
        <a href="https://shopee.co.id/Product-i.1.${number}">Produk ${number}</a>
        <img src="https://img.shopee.co.id/${number}" />
        <span>Rp50.000</span><span>Komisi 12%</span>
      </article>
    `).join('')
    const first = await discoverShopeePage(document, 2, async (products, limit) => products.slice(0, limit))
    expect(first.candidates.map((candidate) => candidate.id)).toEqual(['p-1', 'p-2'])
    expect(first.hasMoreOnPage).toBe(true)
    const second = await discoverShopeePage(document, 2, async (products, limit) => products.slice(0, limit), undefined, ['p-1', 'p-2'])
    expect(second.candidates.map((candidate) => candidate.id)).toEqual(['p-3'])
    expect(second.hasMoreOnPage).toBe(false)
  })
})
