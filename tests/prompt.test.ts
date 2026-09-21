import { describe, expect, it } from 'vitest'

import { buildPinGenerationPrompt } from '../src/core/prompt'

describe('buildPinGenerationPrompt', () => {
  it('labels unreported metrics as unavailable instead of inventing a zero rating or sales', () => {
    const prompt = buildPinGenerationPrompt({
      title: 'Lampu Meja', rating: null, sold: null, commissionPercent: 11.5, price: 80_500,
    })
    expect(prompt).toContain('Rating: Tidak tersedia')
    expect(prompt).toContain('Terjual: Tidak tersedia')
  })

  it('includes source facts and explicit content constraints', () => {
    const prompt = buildPinGenerationPrompt({
      title: 'Kabel Fast Charging 100W',
      description: 'Kabel nilon USB-C untuk pengisian daya.',
      rating: 4.8,
      sold: 250,
      commissionPercent: 12,
      price: 75_000,
    })

    expect(prompt).toContain('Kabel nilon USB-C')
    expect(prompt).toContain('#affiliate')
    expect(prompt).toContain('Jangan menyebut harga')
    expect(prompt).toContain('JSON')
    expect(prompt).not.toContain('Rp75.000')
  })
})
