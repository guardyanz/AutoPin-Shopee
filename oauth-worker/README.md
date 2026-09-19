# AutoPin Shopee OAuth Worker

Cloudflare Worker for the Pinterest Authorization Code flow. It keeps the App
Secret server-side, validates a one-time OAuth `state`, exchanges the code, and
returns credentials to the Chrome extension through a short-lived one-time
ticket. It requests the fixed least-privilege scope set documented in the API
submission pack.

## Trial deployment

The OAuth service is deployed at:

```text
https://autopin-shopee-oauth.akurindowijayapwt.workers.dev
```

Register this exact Pinterest redirect URI (including the path, with no trailing slash):

```text
https://autopin-shopee-oauth.akurindowijayapwt.workers.dev/v1/oauth/pinterest/callback
```

The production and preview KV namespace IDs and the redirect URI are already
configured in `wrangler.jsonc`. After receiving or rotating Pinterest app
credentials, set them without writing either value to a file:

```powershell
npm install
npx wrangler secret put PINTEREST_CLIENT_ID
npx wrangler secret put PINTEREST_CLIENT_SECRET
npm run deploy
```

For local development, copy `.dev.vars.example` to `.dev.vars`. That file is
ignored by Git. Never commit App Secret, access tokens, refresh tokens, or OAuth
tickets.

## Verification

```powershell
npm run check
npm test
```
