# AutoPin Amazon service

Backend privat ini menjembatani ekstensi AutoPin dengan Amazon Creators API.
Credential Amazon tidak pernah dikirim ke ekstensi. Endpoint lookup hanya
mengembalikan ASIN, judul, dan Special Link Amazon; gambar katalog sengaja tidak
diminta maupun diteruskan.

## Prasyarat

- Amazon Associates account dan akses Creators API.
- Credential ID, Credential Secret, serta credential Version dari Creators API.
- Partner Tag yang valid untuk marketplace tujuan.
- PHP 8.1+ atau Docker.

Credential Product Advertising API lama tidak otomatis menjadi credential
Creators API. Buat credential baru melalui Associates Central bila diperlukan.

## Konfigurasi

Salin `.env.example` menjadi `.env`, lalu isi:

```dotenv
AMAZON_CREDENTIAL_ID=...
AMAZON_CREDENTIAL_SECRET=...
AMAZON_CREDENTIAL_VERSION=3.1
AMAZON_SERVICE_TOKEN=at-least-32-random-characters
TOKEN_CACHE_PATH=/app/var/amazon-token.json
```

Jangan commit `.env`. `AMAZON_SERVICE_TOKEN` adalah secret terpisah yang dipakai
ekstensi untuk memanggil backend. Token OAuth Amazon disimpan sementara di file
cache mode `0600` dan diperbarui sebelum kedaluwarsa.

## Lokal dengan Docker

```bash
docker compose up --build
curl http://127.0.0.1:8080/health
```

Untuk lookup:

```bash
curl -X POST http://127.0.0.1:8080/v1/product-lookups \
  -H "Authorization: Bearer $AMAZON_SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"asin":"B09B2SBHQK","marketplace":"www.amazon.com","partner_tag":"example-20"}'
```

Di produksi, letakkan container di belakang HTTPS reverse proxy atau platform
container yang menyediakan TLS. Jangan membuka port PHP langsung ke internet.

## API

- `GET /health` - health probe tanpa credential Amazon.
- `POST /v1/product-lookups` - bearer-authenticated lookup, maksimum 16 KiB,
  marketplace allowlist, dan rate limit satu request per detik.

Kontrak lengkap ada di [openapi.yaml](openapi.yaml).

## Pemeriksaan

```bash
composer install
composer validate --strict
composer check
composer test
```

## Catatan kepatuhan

- Service meminta `itemInfo.title`, bukan image resource.
- Respons memakai `Cache-Control: no-store`.
- Special Link dari Creators API diteruskan tanpa dibuat ulang di klien.
- Log error tidak mencetak credential, request body, judul, ASIN, atau URL.
- Pemilik akun tetap harus memastikan disclosure dan penggunaan link mematuhi
  Amazon Associates Program policies untuk marketplace-nya.
