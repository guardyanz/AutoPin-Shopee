# Standard access demo — recording script

Pinterest requires a live integration demo and the OAuth flow even for a single intended user. Record this only after Trial approval and after the official API path is working.

Target duration: **3–5 minutes**. Record one continuous take at readable resolution. Redact app secret, tokens, AI keys, personal email, and unrelated browser tabs.

## Pre-recording setup

- Use the Trial/Sandbox environment first, then the environment requested by the upgrade form.
- Have one authorised Shopee Affiliate product ready.
- Have one test Board ready, or demonstrate owner-requested Board creation.
- Enable the browser network panel only if it can be shown without credentials.
- Keep **Developer dry run** on until the final approved action.
- Ensure the app shows a mandatory review/approval state.

## Narration and actions

### 0:00–0:30 — Identity and purpose

> This is Wardiyan AutoPin Shopee, a creator productivity tool for a single account owner. It prepares original product creative from a Shopee Affiliate product selected by the owner. Every Pin is reviewed and explicitly approved before the app calls Pinterest API v5. The app does not collect Pinterest passwords or cookies and does not scrape Pinterest.

Show the public landing page and open the Privacy Policy link.

### 0:30–1:20 — OAuth flow

1. Click **Connect account** inside AutoPin Shopee.
2. Show the redirect to the official Pinterest OAuth consent screen.
3. Briefly show the requested scopes: Boards read/write and Pins read/write.
4. Approve using the test account.
5. Show the return to AutoPin Shopee and connected status.

Say:

> The app uses the Authorization Code flow. The client secret and code exchange are handled server-side. The app never receives or asks for a Pinterest password. OAuth state is validated, and credentials are not shown or logged.

### 1:20–2:20 — Create and review a draft

1. Select one Shopee Affiliate product.
2. Generate the affiliate link and original 1000 by 1500 creative.
3. Show title, description, `#affiliate`, alt text, destination link, Board, and schedule.
4. Change one field to demonstrate owner control.
5. Show that Publish is unavailable until the review confirmation is checked.

Say:

> The user considers this individual Pin, confirms rights and disclosure, chooses the Board and schedule, and makes the final publish decision. The app does not automatically approve a batch.

### 2:20–3:20 — Live API action

1. Click **Approve and publish** for this one Pin.
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
- [ ] The owner approves one specific Pin.
- [ ] Privacy Policy URL is publicly accessible.
- [ ] Disconnect/deletion path is shown.
- [ ] The narration and app behaviour match the submitted form exactly.
