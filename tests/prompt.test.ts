import { describe, expect, it } from 'vitest'

import { buildPinGenerationPrompt, buildPinRepairPrompt } from '../src/core/prompt'

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
    expect(prompt).toContain('pinTitle: 8-180')
    expect(prompt).toContain('keywords: 1-12')
    expect(prompt).toContain('JSON')
    expect(prompt).not.toContain('Rp75.000')
  })

  it('gives the model its invalid response and the exact fields to repair', () => {
    const prompt = buildPinRepairPrompt({
      title: 'Lampu Meja', rating: null, sold: null, commissionPercent: 11.5, price: 80_500,
    }, { pinTitle: 'Lampu Meja', keywords: [''] }, ['keywords[0]: Too small', 'layoutDirection: Invalid input'])
    expect(prompt).toContain('keywords[0]: Too small')
    expect(prompt).toContain('layoutDirection: Invalid input')
    expect(prompt).toContain('"pinTitle":"Lampu Meja"')
    expect(prompt).toContain('SCHEMA JSON')
  })
})
