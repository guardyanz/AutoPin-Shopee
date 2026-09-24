# AutoPin Shopee

AutoPin Shopee adalah ekstensi Chrome Manifest V3 yang menghubungkan alur
**Shopee Affiliate → Pinterest**. Produk diambil dari halaman penawaran Shopee,
shortlink affiliate resmi dibuat dari sesi pengguna, materi Pin disiapkan, lalu
setiap Pin ditampilkan dan dipilih pengguna dalam review batch sebelum dipublikasikan melalui Pinterest API v5.

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
- Mendukung 1–5 tag pelacakan opsional pada shortlink melalui formulir resmi
  **Pakai Tag** / **Tambahkan ke Link** di Shopee Affiliate.
- Membuat judul, deskripsi, alt text, keyword, dan arahan layout melalui
  OpenRouter, OpenAI, atau Gemini dengan validasi konten faktual.
- Merender poster Pinterest 1000 × 1500 secara lokal tanpa mengubah bentuk
  produk secara generatif.
- Memvalidasi Board milik akun terautentikasi, menampilkan ringkasan visual setiap
  draft, meminta pengguna memilih tiap Pin yang diinginkan, lalu menerima satu
  konfirmasi untuk batch terpilih sebelum membuat Pin melalui `POST /v5/pins` dan memverifikasi hasil.
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
  → batch review + pemilihan eksplisit setiap Pin + satu konfirmasi
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
4. Pilih environment yang menerbitkan token Pinterest Anda: token Sandbox untuk
   **Sandbox**, atau product-limited Trial/Standard token untuk **Production**.
5. Klik **Muat Board dari Pinterest**, lalu pilih Board dari daftar. Untuk membuat
   Board baru, isi nama/deskripsi dan klik **Create this Board through API**.
6. Tentukan jumlah halaman Shopee yang akan dipindai (1–10). Isi tag pelacakan
   opsional, dipisahkan koma, jika ingin melacak performa link di Shopee.
7. Biarkan **Developer dry run** aktif untuk percobaan pertama.
8. Klik **Start**. Setelah draft batch siap, poster, copy, Board, dan link
   langsung tampak pada kartu review. Centang setiap Pin yang ingin diterbitkan;
   tidak ada Pin yang terpilih otomatis. **Detail / Edit** bersifat opsional
   untuk melihat ukuran penuh atau mengubah teks. Gunakan **Pause**
   bila ingin melanjutkan review nanti; draft tetap tersimpan. **Stop** akan
   membuang draft yang belum diterbitkan setelah konfirmasi.
9. Nonaktifkan dry run, lalu tekan **Approve selected Pins** satu kali. Hanya Pin
   yang dicentang dipublikasikan langsung berurutan dengan jeda sekitar 10 detik.
   Jika batch lama masih menunggu jadwal berjam-jam, klik **Terbitkan sisa sekarang**.
   Lihat hasilnya di **Recent pins** dan **Activity**.

Jika menggunakan token Trial sementara, periksa masa berlakunya sebelum batch
dimulai; token yang kedaluwarsa akan menghentikan posting sampai diganti.
Pin yang dibuat dengan Trial hanya terlihat oleh pemilik akun sesuai aturan
Pinterest Trial, bukan publik luas.

Product-limited Trial token bersifat sementara. Untuk Standard access, gunakan
OAuth Authorization Code melalui backend yang menjaga App Secret tetap server-side.

Pemilihan produk menggunakan harga Rp25.000–Rp500.000 dan komisi minimal 10%.
Jika tercantum pada kartu, rating minimal 4,7 dan penjualan minimal 100 juga
diterapkan. Rating atau penjualan yang tidak ditampilkan Shopee disimpan sebagai
data tidak tersedia, bukan diisi angka perkiraan. Produk tetap harus Anda tinjau
sebelum publikasi. Tab **Activity** menampilkan jumlah produk terbaca, produk
lolos filter, dan kegagalan mengambil link affiliate.

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

Jika skrip ekstensi belum terpasang pada tab Shopee Affiliate setelah ekstensi
di-reload, AutoPin memuat ulang tab tersebut dan mencoba menghubungkannya kembali.
Jika koneksi tetap gagal, Dashboard menampilkan pesan aslinya; muat ulang tab
Shopee Affiliate secara manual dan klik **Start** lagi.

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
