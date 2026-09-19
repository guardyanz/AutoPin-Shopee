import { describe, expect, it } from 'vitest'

import { validateGeneratedContent } from '../src/core/content-validation'

const validContent = {
  pinTitle: 'Kabel Fast Charging untuk Meja Kerja Lebih Rapi',
  pinDescription: 'Kabel praktis untuk membantu pengisian daya dan menjaga meja tetap tertata. #affiliate',
  altText: 'Kabel pengisi daya tersusun pada poster aksesori gadget',
  keywords: ['kabel fast charging', 'aksesori gadget'],
  layoutDirection: {
    headline: 'Isi daya lebih praktis',
    visualTone: 'clean technology',
    accentPreference: 'cyan',
  },
}

describe('validateGeneratedContent', () => {
  it('accepts factual content with exactly one affiliate disclosure', () => {
    expect(validateGeneratedContent(validContent, ['kabel', 'pengisian daya', 'meja'])).toEqual({
      success: true,
      data: validContent,
    })
  })

  it('rejects missing or repeated affiliate disclosures', () => {
    expect(validateGeneratedContent({ ...validContent, pinDescription: 'Deskripsi tanpa disclosure' }, [])).toMatchObject({ success: false })
    expect(validateGeneratedContent({ ...validContent, pinDescription: '#affiliate Isi daya. #affiliate' }, [])).toMatchObject({ success: false })
  })

  it('rejects price and unsupported urgency claims', () => {
    const result = validateGeneratedContent(
      { ...validContent, pinDescription: 'Harga Rp75.000, beli sekarang sebelum habis! #affiliate' },
      [],
    )
    expect(result).toMatchObject({ success: false })
  })

  it('requires both Amazon disclosures exactly once', () => {
    const amazonContent = {
      ...validContent,
      pinDescription: 'Pilihan produk untuk inspirasi ruang kerja. #affiliate #ad As an Amazon Associate I earn from qualifying purchases.',
    }

    expect(validateGeneratedContent(amazonContent, [], 'amazon')).toMatchObject({ success: true })
    expect(validateGeneratedContent(validContent, [], 'amazon')).toMatchObject({
      success: false,
      errors: expect.arrayContaining([
        'amazon_ad_disclosure_must_appear_once',
        'amazon_associate_statement_must_appear_once',
      ]),
    })
  })
})
