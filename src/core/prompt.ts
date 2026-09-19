import type { ProductCandidate } from './types'

export function buildPinGenerationPrompt(product: Pick<
  ProductCandidate,
  'source' | 'title' | 'description' | 'rating' | 'sold' | 'commissionPercent' | 'price'
>): string {
  const sourceFacts = product.source === 'amazon'
    ? `- Sumber: Amazon Associates\n- Nama produk: ${product.title}\n- Deskripsi: ${product.description ?? 'Tidak tersedia'}\n- Visual: poster tipografis orisinal; foto produk hanya digunakan bila pengguna menyediakan aset miliknya sendiri`
    : `- Sumber: Shopee Affiliate\n- Nama: ${product.title}\n- Deskripsi: ${product.description ?? 'Tidak tersedia'}\n- Rating: ${product.rating}\n- Terjual: ${product.sold}\n- Komisi affiliate: ${product.commissionPercent}%`
  const disclosureRules = product.source === 'amazon'
    ? '- Deskripsi harus mengandung #affiliate tepat satu kali, #ad tepat satu kali, dan kalimat "As an Amazon Associate I earn from qualifying purchases." tepat satu kali.'
    : '- Deskripsi harus mengandung #affiliate tepat satu kali.'
  return `
Buat konten Pinterest berbahasa Indonesia untuk produk affiliate berikut.

FAKTA SUMBER
${sourceFacts}

ATURAN
- Gunakan gaya informatif dan soft-selling.
- Jangan menyebut harga, diskon, voucher, stok terbatas, atau urgensi palsu.
- Jangan membuat klaim yang tidak terdapat dalam fakta sumber.
${disclosureRules}
- Tulis alt text yang faktual dan ringkas.
- Untuk sumber Amazon, jangan menyatakan bahwa poster menampilkan foto produk kecuali fakta sumber menyebut adanya aset milik pengguna.
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
