import type { ProductCandidate } from './types'

export function buildPinGenerationPrompt(product: Pick<
  ProductCandidate,
  'title' | 'description' | 'rating' | 'sold' | 'commissionPercent' | 'price'
>): string {
  return `
Buat konten Pinterest berbahasa Indonesia untuk produk aksesori gadget berikut.

FAKTA SUMBER
- Nama: ${product.title}
- Deskripsi: ${product.description ?? 'Tidak tersedia'}
- Rating: ${product.rating}
- Terjual: ${product.sold}
- Komisi affiliate: ${product.commissionPercent}%

ATURAN
- Gunakan gaya informatif dan soft-selling.
- Jangan menyebut harga, diskon, voucher, stok terbatas, atau urgensi palsu.
- Jangan membuat klaim yang tidak terdapat dalam fakta sumber.
- Deskripsi harus mengandung #affiliate tepat satu kali.
- Tulis alt text yang faktual dan ringkas.
- Headline poster tidak boleh menyebut harga.
- Kembalikan JSON valid saja, tanpa markdown.

SCHEMA JSON
{
  "pinTitle": "string",
  "pinDescription": "string",
  "altText": "string",
  "keywords": ["string"],
  "layoutDirection": {
    "headline": "string",
    "visualTone": "string",
    "accentPreference": "string"
  }
}
  `.trim()
}
