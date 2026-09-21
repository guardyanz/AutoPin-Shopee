import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ExtensionMessage, MessageResponse } from '../src/core/messages'
import type { ShopeeDiscoveryResult } from '../src/adapters/shopee-pagination'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('Shopee content script discovery', () => {
  it('collects the correct card link when the offer has no rating and its button is outside the inner ItemCard', async () => {
    document.body.innerHTML = `
      <div class="product-offer-item">
        <div class="ItemCard"><a href="https://affiliate.shopee.co.id/offer/product_offer/1234">
          <span class="ItemCard__name">Too expensive</span></a>
          <img src="https://down-id.img.susercontent.com/file/expensive">
          <span class="ItemCard__price">Rp13.999.000</span><span>373 terjual</span><span>Komisi hingga 1,5%</span>
        </div><button id="other-link">Buat Link</button>
      </div>
      <div class="product-offer-item">
        <div class="ItemCard"><a href="https://affiliate.shopee.co.id/offer/product_offer/123">
          <span class="ItemCard__name">Lampu Meja</span></a>
          <img src="https://down-id.img.susercontent.com/file/lamp">
          <span class="ItemCard__price">Rp80.500</span><span>3RB+ terjual</span><span>Komisi hingga 11,5%</span>
        </div><button id="lamp-link">Buat Link</button>
      </div>
    `
    document.querySelector('#other-link')!.addEventListener('click', () => { throw new Error('Wrong product card clicked') })
    document.querySelector('#lamp-link')!.addEventListener('click', () => {
      const dialog = document.createElement('div')
      dialog.setAttribute('role', 'dialog')
      const input = document.createElement('input')
      // React sets the current value; a value attribute is not guaranteed.
      input.value = 'https://s.shopee.co.id/lamp-affiliate'
      const close = document.createElement('button')
      close.setAttribute('aria-label', 'Close')
      close.addEventListener('click', () => dialog.remove())
      dialog.append(input, close)
      document.body.append(dialog)
    })

    const result = await discoverThroughContentScript()
    expect(result).toMatchObject({ ok: true, data: {
      pagesScanned: 1,
      candidates: [{ id: '123', rating: null, sold: 3_000, affiliateUrl: 'https://s.shopee.co.id/lamp-affiliate' }],
      diagnostics: { productsRead: 2, productsMatchingFilters: 1, affiliateLinkFailures: 0 },
    } })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
  })

  it('tries another eligible card when link generation fails and reports the failure separately', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    document.body.innerHTML = `
      <div class="product-offer-item">
        <a href="https://affiliate.shopee.co.id/offer/product_offer/123">Link unavailable</a>
        <img src="https://down-id.img.susercontent.com/file/a">
        <span>Rp80.500</span><span>3RB+ terjual</span><span>Komisi hingga 11,5%</span>
      </div>
      <div class="product-offer-item">
        <a href="https://affiliate.shopee.co.id/offer/product_offer/456">Working offer</a>
        <img src="https://down-id.img.susercontent.com/file/b">
        <span>Rp80.500</span><span>3RB+ terjual</span><span>Komisi hingga 11,5%</span>
        <a href="https://s.shopee.co.id/working-link">Affiliate link</a>
      </div>
    `
    expect(await discoverThroughContentScript()).toMatchObject({ ok: true, data: {
      candidates: [{ id: '456', affiliateUrl: 'https://s.shopee.co.id/working-link' }],
      diagnostics: { productsRead: 2, productsMatchingFilters: 2, affiliateLinkFailures: 1,
        lastAffiliateError: { code: 'affiliate_action_missing' } },
    } })
  })

  it('reports offers rejected by known filters without attempting affiliate actions', async () => {
    document.body.innerHTML = `
      <div class="product-offer-item">
        <a href="https://affiliate.shopee.co.id/offer/product_offer/123">Low price offer</a>
        <img src="https://down-id.img.susercontent.com/file/a">
        <span>Rp11.728</span><span>10RB+ terjual</span><span>Komisi hingga 11,5%</span>
      </div>
    `
    expect(await discoverThroughContentScript()).toMatchObject({ ok: true, data: {
      candidates: [],
      diagnostics: { productsRead: 1, productsMatchingFilters: 0, affiliateLinkFailures: 0 },
    } })
  })
})

async function discoverThroughContentScript(): Promise<MessageResponse<ShopeeDiscoveryResult>> {
  type Listener = (message: ExtensionMessage, sender: { id: string }, respond: (result: MessageResponse<ShopeeDiscoveryResult>) => void) => boolean
  let listener: Listener | undefined
  vi.stubGlobal('chrome', { runtime: { id: 'test-extension', onMessage: { addListener: (handler: Listener) => { listener = handler } } } })
  vi.resetModules()
  await import('../src/content/shopee')
  return new Promise((resolve) => {
    listener!({ type: 'SHOPEE_DISCOVER', maxPages: 1, maxProducts: 1 }, { id: 'test-extension' }, resolve)
  })
}
