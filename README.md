# AutoPin Shopee

AutoPin Shopee adalah ekstensi Chrome Manifest V3 yang menghubungkan alur
**Shopee Affiliate → Pinterest**. Produk diambil dari halaman penawaran Shopee,
shortlink affiliate resmi dibuat dari sesi pengguna, materi Pin disiapkan, lalu
setiap Pin ditinjau pengguna, lalu dipublikasikan melalui Pinterest API v5.

Proyek ini mengganti sumber Adobe Stock pada konsep AutoPin dengan adapter
Shopee yang terinspirasi dan diadaptasi dari
[ShopiThread](https://github.com/sodikinnaa/shopithread).

## Yang sudah diimplementasikan

- Memindai 1–10 halaman penawaran Shopee Affiliate secara berurutan.
- Mengenali beberapa variasi DOM kartu produk dan menghapus suffix resize untuk
  memakai gambar Shopee beresolusi lebih tinggi.
- Menggabungkan produk duplikat berdasarkan ID Shopee.
- Mengambil detail produk dan membuat shortlink resmi `s.shopee.co.id` atau
  `shope.ee` melalui UI Shopee Affiliate yang sedang login.
- Membuat judul, deskripsi, alt text, keyword, dan arahan layout melalui
  OpenRouter, OpenAI, atau Gemini dengan validasi konten faktual.
- Merender poster Pinterest 1000 × 1500 secara lokal tanpa mengubah bentuk
  produk secara generatif.
- Memvalidasi Board milik akun terautentikasi, meminta persetujuan eksplisit untuk
  setiap draft, membuat Pin melalui `POST /v5/pins`, lalu memverifikasi hasil.
- Menyimpan checkpoint di IndexedDB, melanjutkan pekerjaan setelah browser hidup
  kembali, mencegah produk yang sama dipakai ulang selama 30 hari, dan membatasi
  publikasi sampai 10 Pin per hari.
- Menyediakan mode **Developer dry run** yang berhenti sebelum request Create Pin.

## Arsitektur singkat

```text
Shopee Affiliate pages
  → discovery + pagination
  → product detail + HD image
  → official affiliate shortlink
  → validated AI copy + local poster
  → per-Pin review + explicit approval
  → Pinterest API v5 create + verification
  → local publication history
```

AutoPin Shopee tidak mengumpulkan password atau session cookie Pinterest, tidak
melakukan scraping Pinterest, dan tidak mempunyai content script Pinterest.

## Build dan instalasi

Prasyarat: Node.js 22.12+ dan Chrome 116+.

```powershell
npm ci
npm run build
```

Lalu buka `chrome://extensions`, aktifkan **Developer mode**, pilih
**Load unpacked**, dan arahkan ke folder `AutoPin-Shopee/dist`.

Gunakan profil Chrome khusus otomasi, lalu login manual ke:

1. `https://affiliate.shopee.co.id/offer/product_offer`
2. Pinterest Business yang telah memperoleh Trial API access.

## Konfigurasi dan penggunaan

1. Buka side panel **AutoPin Shopee**.
2. Di tab **Settings**, pilih provider AI dan isi API key.
3. Klik **Fetch Models**, pilih model utama, dan simpan.
4. Masukkan product-limited Pinterest Trial token, pilih Sandbox, dan isi Board ID.
5. Tentukan jumlah halaman Shopee yang akan dipindai (1–10).
6. Biarkan **Developer dry run** aktif untuk percobaan pertama.
7. Klik **Start**, lalu periksa poster, copy, disclosure, Board, jadwal, dan link.
8. Nonaktifkan dry run dan tekan **Approve Pin** hanya untuk draft yang sudah benar.

Product-limited Trial token bersifat sementara. Untuk Standard access, gunakan
OAuth Authorization Code melalui backend yang menjaga App Secret tetap server-side.

## Pengajuan Pinterest API

Paket pengajuan lengkap berada di
[`docs/pinterest-submission/`](docs/pinterest-submission/README.md): jawaban form,
scope, security/data flow, checklist Trial → Standard, ikon submission, dan skrip
video demo. Website publik dan Privacy Policy berada di folder `docs/` dan akan
dipublikasikan otomatis oleh GitHub Pages setelah repository di-push.

OAuth callback service berada di [`oauth-worker/`](oauth-worker/README.md). Worker
menjaga App Secret di server, memvalidasi state, menukar authorization code, dan
memberikan token ke extension melalui one-time ticket singkat.

## Safety stop

Workflow berhenti bila menemukan login kedaluwarsa, CAPTCHA, kuota harian, atau
tiga kegagalan produk berturut-turut. Selesaikan tindakan manual yang diperlukan,
periksa tab **Activity**, lalu pilih **Resume**.

DOM Shopee dan Pinterest dapat berubah sewaktu-waktu. Jalankan dry run setelah
setiap perubahan besar pada situs dan patuhi ketentuan Shopee Affiliate serta
Pinterest yang berlaku pada akun Anda.

## Pengujian

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
npm audit
```

`test:e2e` memerlukan Chrome/Chromium dengan UI. Path executable dapat diberikan
melalui environment variable `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

## Sumber dan lisensi

AutoPin Shopee merupakan repository baru, bukan perubahan langsung pada kedua
repository sumber. Atribusi lengkap tersedia di [NOTICE.md](NOTICE.md).

- ShopiThread: MIT, copyright (c) 2026 Sodikin (sodikinnaa).
- PinterestBulkPostBot: MIT, copyright (c) 2022 Enzo Day.
- AutoPin Shopee: MIT, lihat [LICENSE](LICENSE).

AutoPin Shopee adalah proyek independen dan tidak berafiliasi dengan Shopee atau
Pinterest.
