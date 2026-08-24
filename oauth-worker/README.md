# AutoPin Shopee OAuth Worker

Cloudflare Worker for the Pinterest Authorization Code flow. It keeps the App
Secret server-side, validates a one-time OAuth `state`, exchanges the code, and
returns credentials to the Chrome extension through a short-lived one-time
ticket. It requests the fixed least-privilege scope set documented in the API
submission pack.

## Setup after Trial approval

```powershell
npm install
npx wrangler kv namespace create OAUTH_TRANSACTIONS
npx wrangler kv namespace create OAUTH_TRANSACTIONS --preview
```

Put the returned namespace IDs and final workers.dev redirect URI in
`wrangler.jsonc`. Register that exact redirect URI in Pinterest My Apps.

Set secrets without writing them to a file:

```powershell
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
