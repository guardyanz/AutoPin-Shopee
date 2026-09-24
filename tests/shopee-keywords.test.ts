import { describe, expect, it } from 'vitest'

import { matchesProductKeywords } from '../src/adapters/shopee-keywords'

describe('product theme keywords', () => {
  it('requires every keyword in the product title regardless of order or case', () => {
    expect(matchesProductKeywords('Lampu LED untuk Meja Belajar', 'meja lampu')).toBe(true)
    expect(matchesProductKeywords('Lampu LED untuk Meja Belajar', 'meja kursi')).toBe(false)
    expect(matchesProductKeywords('Apa saja', '')).toBe(true)
  })
})
