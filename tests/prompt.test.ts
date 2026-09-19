import { describe, expect, it } from 'vitest'

import { buildPinGenerationPrompt } from '../src/core/prompt'

describe('buildPinGenerationPrompt', () => {
  it('includes source facts and explicit content constraints', () => {
    const prompt = buildPinGenerationPrompt({
      source: 'shopee',
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

  it('requires Amazon disclosures and an original visual', () => {
    const prompt = buildPinGenerationPrompt({
      source: 'amazon',
      title: 'Compact desk lamp',
      description: 'Amazon product selected by the account owner through Creators API.',
      rating: 0,
      sold: 0,
      commissionPercent: 0,
      price: 0,
    })

    expect(prompt).toContain('#ad')
    expect(prompt).toContain('As an Amazon Associate I earn from qualifying purchases.')
    expect(prompt).toContain('poster tipografis orisinal')
    expect(prompt).not.toContain('Rating:')
  })
})
