# Standard access demo — recording script

Pinterest requires a live integration demo and the OAuth flow even for a single intended user. Record this only after Trial approval and after the official API path is working.

Target duration: **3–5 minutes**. Record one continuous take at readable resolution. Redact app secret, tokens, AI keys, personal email, and unrelated browser tabs.

## Pre-recording setup

- Use the Trial/Sandbox environment first, then the environment requested by the upgrade form.
- Have at least two authorised Shopee Affiliate products ready to show batch selection.
- Have one test Board ready, or demonstrate owner-requested Board creation.
- Enable the browser network panel only if it can be shown without credentials.
- Use **Developer dry run** during preparation; switch it off before the final live batch confirmation.
- Ensure the app shows a mandatory review/approval state.

## Narration and actions

### 0:00–0:30 — Identity and purpose

> This is Wardiyan PinShop, a creator productivity tool for a single account owner. It prepares original product creative from Shopee Affiliate products. The owner reviews the batch, selects Pins including with select all, and explicitly confirms before the app calls Pinterest API v5. The app does not collect Pinterest passwords or cookies and does not scrape Pinterest.

Show the public landing page and open the Privacy Policy link.

### 0:30–1:20 — OAuth flow

1. Click **Connect account** inside PinShop.
2. Show the redirect to the official Pinterest OAuth consent screen.
3. Briefly show the requested scopes: Boards read/write and Pins read/write.
4. Approve using the test account.
5. Show the return to PinShop and connected status.

Say:

> The app uses the Authorization Code flow. The client secret and code exchange are handled server-side. The app never receives or asks for a Pinterest password. OAuth state is validated, and credentials are not shown or logged.

### 1:20–2:20 — Create and review a draft

1. Prepare at least two Shopee Affiliate drafts.
2. Show the generated affiliate links and original 1000 by 1500 creative.
3. Show the poster, title, description, `#affiliate`, destination link, and Board on each batch card. Open **Detail / Edit** on one draft to show the full poster and alt text.
4. Change one field to demonstrate owner control.
5. Show that no Pin is selected automatically; demonstrate **Pilih semua Pin** and optionally deselect a draft.

Say:

> The user reviews the batch, confirms rights and disclosure, chooses all or a subset of drafts, and makes one final decision for the selected batch. Unselected drafts cannot be posted.

### 2:20–3:20 — Live API action

1. Click **Setujui Pin pilihan** once for the selected drafts.
2. Show the app's request status without exposing the bearer token.
3. Show the successful Pin ID/URL returned by Pinterest.
4. Open the created Pin on Pinterest and show the image, copy, Board, and affiliate destination.

Say:

> This Pin was created through `POST /v5/pins` using the authenticated owner's token. The app reads the resulting Pin only to verify this requested action. It does not blindly retry an ambiguous create request.

### 3:20–4:00 — Disconnect and deletion

1. Open Settings and click **Disconnect account**.
2. Show the Data Deletion page.
3. Optionally show the Pinterest connected-app settings where access can be revoked.

Say:

> The owner can disconnect, revoke authorisation, and delete local app data. Pinterest API data is not sold, combined across users, used for engagement automation, or used to train AI.

## Final quality check

- [ ] Official Pinterest OAuth consent screen is clearly visible.
- [ ] No password, cookie, app secret, access token, or refresh token is visible.
- [ ] Live API-created Pin is shown—not a wireframe or browser form automation.
- [ ] Every Pin is visible in batch review, no draft is preselected, and the owner deliberately selects all or a subset before confirming.
- [ ] Privacy Policy URL is publicly accessible.
- [ ] Disconnect/deletion path is shown.
- [ ] The narration and app behaviour match the submitted form exactly.
