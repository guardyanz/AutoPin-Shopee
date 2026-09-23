import type { ProductCandidate } from './types'

export function buildPinGenerationPrompt(product: Pick<
  ProductCandidate,
  'title' | 'description' | 'rating' | 'sold' | 'commissionPercent' | 'price'
>): string {
  return `
Buat konten Pinterest berbahasa Indonesia untuk produk Shopee Affiliate berikut.

FAKTA SUMBER
- Nama: ${product.title}
- Deskripsi: ${product.description ?? 'Tidak tersedia'}
- Rating: ${product.rating ?? 'Tidak tersedia'}
- Terjual: ${product.sold ?? 'Tidak tersedia'}
- Komisi affiliate: ${product.commissionPercent}%

ATURAN
- Gunakan gaya informatif dan soft-selling.
- Jangan menyebut harga, diskon, voucher, stok terbatas, atau urgensi palsu.
- Jangan membuat klaim yang tidak terdapat dalam fakta sumber.
- Deskripsi harus mengandung #affiliate tepat satu kali.
- Tulis alt text yang faktual dan ringkas.
- Headline poster tidak boleh menyebut harga.
- Semua field dalam SCHEMA JSON wajib ada, bukan null, dan bertipe tepat.
- Batas panjang karakter: pinTitle: 8-180; pinDescription: 20-1000; altText: 8-500.
- keywords: 1-12 string, masing-masing 2-80 karakter; headline: 3-100; visualTone: 3-80; accentPreference: 2-40.
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

export function buildPinRepairPrompt(
  product: Parameters<typeof buildPinGenerationPrompt>[0],
  invalidResponse: unknown,
  errors: string[],
): string {
  const previousResponse = JSON.stringify(invalidResponse)?.slice(0, 12_000) ?? 'null'
  return `${buildPinGenerationPrompt(product)}

RESPONS SEBELUMNYA YANG TIDAK VALID
${previousResponse}

KESALAHAN YANG HARUS DIPERBAIKI
- ${errors.join('\n- ')}

Kembalikan seluruh objek JSON sesuai SCHEMA JSON di atas. Pertahankan fakta sumber, isi semua field wajib dengan tipe yang benar, dan perbaiki kesalahan yang disebutkan.`
}
