import { beforeEach, describe, expect, it } from 'vitest'

import { applyShopeeAffiliateTags } from '../src/adapters/shopee-affiliate-tags'

beforeEach(() => {
  document.body.innerHTML = `<div role="dialog">
    <h2>Link Penawaran Produk</h2>
    <div>Pakai Tag <label><input type="radio" name="use-tag" value="no" checked>Tidak</label><label><input type="radio" name="use-tag" value="yes">Iya</label></div>
    <div><label>Tag ke 1<input type="text" placeholder="Contoh: SepatuOlahraga"></label></div>
    <div><label>Tag ke 2<input type="text" placeholder="Contoh: InstagramFeed"></label></div>
    <div><label>Tag ke 3<input type="text" placeholder="Contoh: 1212BirthdaySale"></label></div>
    <div><label>Tag ke 4<input type="text"></label></div>
    <div><label>Tag ke 5<input type="text"></label></div>
    <button type="button">Tambahkan ke Link</button>
  </div>`
})

describe('Shopee affiliate tags', () => {
  it('selects Iya, fills each tag field, and applies them to the generated link', async () => {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    let applied: string[] = []
    dialog.querySelector('button')!.addEventListener('click', () => {
      applied = Array.from(dialog.querySelectorAll<HTMLInputElement>('input[type="text"]')).map((input) => input.value)
    })

    await applyShopeeAffiliateTags(dialog, ['PinterestFeed', 'Batch2'])

    expect(dialog.querySelector<HTMLInputElement>('input[value="yes"]')?.checked).toBe(true)
    expect(applied).toEqual(['PinterestFeed', 'Batch2', '', '', ''])
  })

  it('refuses to create an untagged link if Shopee changes the tag controls', async () => {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    dialog.querySelector('button')!.remove()
    await expect(applyShopeeAffiliateTags(dialog, ['PinterestFeed'])).rejects.toThrow(/Tambahkan ke Link/)
  })

  it('supports tag captions rendered as plain text instead of label elements', async () => {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    dialog.querySelectorAll('label').forEach((label) => {
      if (!/^Tag ke/i.test(label.textContent?.trim() ?? '')) return
      const container = document.createElement('div')
      const caption = document.createElement('span')
      caption.textContent = label.childNodes[0]?.textContent ?? ''
      container.append(caption, label.querySelector('input')!)
      label.replaceWith(container)
    })
    await applyShopeeAffiliateTags(dialog, ['PinterestFeed'])
    expect(dialog.querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe('PinterestFeed')
  })
})
