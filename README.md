# AutoPin Shopee

AutoPin Shopee adalah ekstensi Chrome Manifest V3 untuk alur **Shopee Affiliate
atau Amazon Associates -> Pinterest**. Aplikasi menyiapkan materi Pin, lalu pemilik
akun meninjau dan menyetujui setiap Pin sebelum publikasi melalui Pinterest API v5.

Repository ini dibuat sebagai proyek baru. Adapter Shopee diadaptasi dari
[ShopiThread](https://github.com/sodikinnaa/shopithread). Integrasi Amazon memakai
[Amazon Creators API PHP SDK](https://github.com/timslabs/amazon-creatorsapi-php-sdk),
bukan API Pinterest privat atau otomasi password/cookie.

## Fitur

- Memindai 1-10 halaman penawaran Shopee Affiliate, mengambil detail, gambar, dan
  membuat shortlink resmi dari sesi pengguna yang sedang login.
- Mengambil ASIN, judul, dan Special Link Amazon melalui backend Creators API.
- Membuat poster Amazon otomatis sebagai desain tipografis/geometris orisinal.
  Pengguna tidak perlu menyiapkan gambar sendiri.
- Mendukung gambar opsional milik pengguna untuk Amazon setelah konfirmasi hak.
  Gambar katalog Amazon tidak disalin ke Pinterest.
- Membuat copy melalui OpenRouter, OpenAI, atau Gemini dengan pemeriksaan klaim,
  disclosure `#affiliate`, dan disclosure Amazon tambahan.
- Meminta persetujuan eksplisit untuk setiap draft sebelum `POST /v5/pins`.
- Memverifikasi Pin melalui API, mencegah duplikasi 30 hari, membatasi 10 Pin per
  hari, dan menyediakan Developer dry run.

## Alur

```text
Shopee UI                         Amazon Creators API backend
  -> metadata + shortlink          -> ASIN + title + Special Link
              \                   /
               -> validated AI copy
               -> local original poster
               -> review and explicit approval
               -> Pinterest API v5 create + verify
```

Backend Amazon hanya meminta resource judul. URL gambar katalog tidak diminta,
disimpan, atau diteruskan. Credential ID/Secret Amazon tetap berada di server;
ekstensi hanya memegang service token terpisah.

## Build ekstensi

Prasyarat: Node.js 22.12+ dan Chrome 116+.

```powershell
npm ci
npm run build
```

Buka `chrome://extensions`, aktifkan **Developer mode**, pilih **Load unpacked**,
lalu arahkan ke `AutoPin-Shopee/dist`.

## Menjalankan sumber Shopee

1. Login manual ke `https://affiliate.shopee.co.id/offer/product_offer`.
2. Di Settings, pilih **Shopee Affiliate**.
3. Konfigurasikan provider AI, Pinterest OAuth/Board, dan jumlah halaman.
4. Jalankan dengan Developer dry run aktif, tinjau draft, kemudian setujui Pin.

## Menjalankan sumber Amazon

Sumber Amazon memerlukan akses Amazon Creators API, Partner Tag yang sesuai
marketplace, dan backend HTTPS dari folder [`amazon-service/`](amazon-service/README.md).

1. Deploy backend dan simpan Credential ID, Credential Secret, serta Version hanya
   sebagai environment secrets di server.
2. Buat service token acak minimal 32 karakter.
3. Di Settings, pilih **Amazon Associates**, isi URL backend, service token,
   marketplace, Partner Tag, dan ASIN.
4. Biarkan gambar opsional kosong agar AutoPin membuat poster orisinal otomatis,
   atau unggah gambar yang hak penggunaannya Anda miliki.
5. Klik **Test Amazon lookup**, lalu jalankan dry run dan tinjau hasil.

Contoh membuat service token di PowerShell:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToHexString($bytes).ToLowerInvariant()
```

## Pinterest API

Materi pengajuan berada di
[`docs/pinterest-submission/`](docs/pinterest-submission/README.md). OAuth callback
service berada di [`oauth-worker/`](oauth-worker/README.md). App Secret Pinterest
dan pertukaran authorization code tetap server-side.

AutoPin tidak meminta password/cookie Pinterest, tidak melakukan scraping
Pinterest, dan tidak memiliki content script Pinterest. Trial token bersifat
sementara; gunakan OAuth Authorization Code untuk Standard access.

## Safety stop

Workflow berhenti saat login Shopee kedaluwarsa, CAPTCHA muncul, kuota harian
tercapai, atau tiga produk gagal berturut-turut. Create Pin tidak diulang secara
buta setelah respons ambigu.

## Pengujian

```powershell
npm run typecheck
npm test
npm run build
npm run test:e2e
npm audit
```

Pengujian backend PHP dijalankan CI. Secara lokal:

```powershell
cd amazon-service
composer install
composer check
composer test
```

## Sumber dan lisensi

Atribusi lengkap tersedia di [NOTICE.md](NOTICE.md). AutoPin Shopee berlisensi
MIT. SDK Amazon adalah paket Apache-2.0 dari kode SDK resmi Amazon. AutoPin Shopee
adalah proyek independen dan tidak berafiliasi dengan Amazon, Pinterest, atau
Shopee.
