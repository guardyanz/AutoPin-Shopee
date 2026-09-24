# PinShop

PinShop adalah ekstensi Chrome Manifest V3 yang menghubungkan alur
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
  draft, memberi pilihan pilih semua atau memilih Pin tertentu, lalu menerima satu
  konfirmasi untuk batch terpilih sebelum membuat Pin melalui `POST /v5/pins` dan memverifikasi hasil.
- Menyimpan checkpoint di IndexedDB, melanjutkan pekerjaan setelah browser hidup
  kembali, mencegah produk yang sama dipakai ulang selama 30 hari, dan membatasi
  publikasi sampai 100 Pin per hari (batas aplikasi; batas API Pinterest tetap berlaku).
- Menyediakan mode **Developer dry run** yang berhenti sebelum request Create Pin.

## Arsitektur singkat

```text
Shopee Affiliate pages
  → discovery + pagination
  → product detail + HD image
  → official affiliate shortlink
  → validated AI copy + local poster
  → galeri batch + pilih semua atau pilih sebagian + satu konfirmasi
  → Pinterest API v5 create + verification
  → local publication history
```

PinShop tidak mengumpulkan password atau session cookie Pinterest, tidak
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

1. Buka side panel **PinShop**.
2. Di tab **Pengaturan**, buka bagian **AI & model**, pilih penyedia AI dan isi API key.
3. Klik **Muat model**, pilih model utama, dan simpan.
4. Buka bagian **Pinterest & Board**, lalu pilih environment yang menerbitkan token Pinterest Anda: token Sandbox untuk
   **Sandbox**, atau product-limited Trial/Standard token untuk **Production**.
5. Klik **Muat Board dari Pinterest**, lalu pilih Board dari daftar. Untuk membuat
   Board baru, isi nama/deskripsi dan klik **Buat Board melalui API**.
6. Bagian **Produk & batch** sudah terbuka. Tentukan jumlah halaman Shopee yang akan dipindai (1–10), ukuran batch
   (1–100), serta tab kategori Shopee. Klik **Muat kategori** saat halaman
   Penawaran Produk terbuka, kemudian pilih nama tab yang tersedia. Kata kunci
   produk bersifat opsional: setiap kata harus ada pada judul produk. Untuk tema
   Board yang sempit, pakai kategori dan kata kunci bersamaan; untuk tema luas,
   cukup kategori. Isi tag pelacakan opsional, dipisahkan koma, bila perlu.
7. Biarkan **Developer dry run** aktif untuk percobaan pertama.
8. Klik **Mulai**. Setelah draft batch siap, poster, copy, Board, dan link
   tampak pada galeri review. Klik **Pilih semua Pin** untuk memilih seluruh draft
   siap sekaligus, atau centang hanya Pin tertentu. Tidak ada Pin yang terpilih
   otomatis. **Detail / Edit** bersifat opsional untuk melihat ukuran penuh atau
   mengubah teks. Gunakan **Jeda**
   bila ingin melanjutkan review nanti; draft tetap tersimpan. **Stop** akan
   membuang draft yang belum diterbitkan setelah konfirmasi. Tombol
   **Hentikan batch** hanya muncul saat ada proses aktif.
9. Nonaktifkan uji tanpa publikasi, lalu tekan **Setujui Pin pilihan** satu kali. Periksa
   daftar Pin yang tampil di dialog dan konfirmasikan. Hanya Pin yang dipilih
   dipublikasikan langsung berurutan dengan jeda sekitar 10 detik.
   Jika batch lama masih menunggu jadwal berjam-jam, klik **Terbitkan sisa sekarang**.
   Lihat hasilnya di **Pin terbaru** dan **Aktivitas**.

Jika menggunakan token Trial sementara, periksa masa berlakunya sebelum batch
dimulai; token yang kedaluwarsa akan menghentikan posting sampai diganti.
Pin yang dibuat dengan Trial hanya terlihat oleh pemilik akun sesuai aturan
Pinterest Trial, bukan publik luas.

Angka **Terbit hari ini** (misalnya `10/100`) adalah Pin yang tercatat sudah
terbit pada hari kalender lokal, bukan jumlah draft lama. Menekan **Hentikan
batch** membersihkan draft yang belum terbit, tetapi tidak menghapus riwayat
publikasi atau mengembalikan jatah harian. Untuk batch baru setelah status
**Berhenti**, perbaiki sumber Shopee bila perlu lalu klik **Mulai**. Hitungan
hari ini dihitung ulang dari riwayat publikasi dan kembali nol pada hari baru.

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
periksa tab **Aktivitas**, lalu pilih **Lanjutkan**.

Jika skrip ekstensi belum terpasang pada tab Shopee Affiliate setelah ekstensi
di-reload, PinShop memuat ulang tab tersebut dan mencoba menghubungkannya kembali.
Jika koneksi tetap gagal, Dashboard menampilkan pesan aslinya; muat ulang tab
Shopee Affiliate secara manual dan klik **Mulai** lagi.

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

PinShop merupakan repository baru, bukan perubahan langsung pada kedua
repository sumber. Atribusi lengkap tersedia di [NOTICE.md](NOTICE.md).

- ShopiThread: MIT, copyright (c) 2026 Sodikin (sodikinnaa).
- PinterestBulkPostBot: MIT, copyright (c) 2022 Enzo Day.
- PinShop: MIT, lihat [LICENSE](LICENSE).

PinShop adalah proyek independen dan tidak berafiliasi dengan Shopee atau
Pinterest.
