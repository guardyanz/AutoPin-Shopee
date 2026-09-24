import { describe, expect, it } from 'vitest'

import { listShopeeCategories, selectShopeeCategory } from '../src/adapters/shopee-category'

describe('Shopee category tabs', () => {
  it('lists the categories shown in the affiliate product tabs and selects one before discovery', async () => {
    document.body.innerHTML = `
      <div role="tablist">
        <button role="tab" aria-selected="true">Semua</button>
        <button role="tab" aria-selected="false">Perlengkapan Rumah</button>
        <button role="tab" aria-selected="false">Kesehatan</button>
      </div>
    `
    const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
    tabs[1].addEventListener('click', () => {
      tabs.forEach((tab) => tab.setAttribute('aria-selected', 'false'))
      tabs[1].setAttribute('aria-selected', 'true')
    })

    expect(listShopeeCategories(document).map(({ label }) => label)).toEqual(['Semua', 'Perlengkapan Rumah', 'Kesehatan'])
    await selectShopeeCategory(document, 'Perlengkapan Rumah')
    expect(listShopeeCategories(document).find(({ selected }) => selected)?.label).toBe('Perlengkapan Rumah')
  })

  it('fails rather than silently scanning every category when the chosen tab is unavailable', async () => {
    document.body.innerHTML = '<div role="tablist"><button>Semua</button><button>Kesehatan</button><button>Otomotif</button></div>'
    await expect(selectShopeeCategory(document, 'Perlengkapan Rumah')).rejects.toThrow('tidak tersedia')
  })
})
