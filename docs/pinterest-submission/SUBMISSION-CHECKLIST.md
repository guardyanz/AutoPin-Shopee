# Pinterest API submission checklist

## Phase 1 — Trial access request

- [ ] Pinterest Business account is active.
- [ ] Business-account email is verified.
- [ ] Pinterest Developer Terms are accepted.
- [ ] Repository is pushed and GitHub Pages deployment succeeds.
- [ ] Landing page opens publicly in an incognito browser.
- [ ] Privacy Policy opens publicly with no login, redirect loop, or missing assets.
- [ ] Privacy contact email and company identity are correct.
- [ ] Upload `assets/autopin-shopee-app-icon-512.png`.
- [ ] Paste the exact values from `FORM-ANSWERS.md`.
- [ ] Select **Personal API access** for the current single-owner deployment.
- [ ] Select **Pin creation & scheduling** and **Ecommerce**.
- [ ] Select **Creators** and **Merchants**.
- [ ] Select **Yes, mine** for Pins/Boards data.
- [ ] Complete reCAPTCHA and submit.
- [ ] Save a screenshot of the submitted application and confirmation email.

## Phase 2 — Trial implementation

- [ ] Record App ID locally in an ignored environment file.
- [ ] Record App Secret only in the OAuth service's encrypted secret store.
- [ ] Deploy the OAuth callback service.
- [ ] Register the exact HTTPS redirect URI—no secondary redirect.
- [ ] Request only `boards:read boards:write pins:read pins:write`.
- [ ] Test OAuth state mismatch, denial, expiry, and token refresh.
- [ ] Test `GET /v5/boards`, optional `POST /v5/boards`, `POST /v5/pins`, and `GET /v5/pins/{id}` in Sandbox.
- [ ] Confirm every Pin is displayed and individually selected before one batch confirmation; no Pin is preselected.
- [ ] Confirm ambiguous Create Pin responses are not automatically retried.
- [ ] Confirm disconnect and local data deletion.
- [ ] Re-run dependency audit and secret scan.

## Phase 3 — Standard access upgrade

- [ ] Trial access is approved and the app complies with current Developer Guidelines.
- [ ] Live OAuth and Pinterest API integration are working.
- [ ] Record the video using `STANDARD-ACCESS-VIDEO-SCRIPT.md`.
- [ ] Video shows OAuth, requested scopes, individually reviewed/selected Pins, one batch confirmation, live API result, and disconnect.
- [ ] Video contains no secrets or unrelated personal data.
- [ ] Submitted description, Privacy Policy, video narration, and product behaviour agree.
- [ ] Upload the demo from the app's **Upgrade** flow and submit.

## Do not submit Standard access while any item below is true

- Pinterest production still uses DOM clicking or session-cookie automation.
- A batch can publish without the owner reviewing each Pin.
- The OAuth consent screen is missing from the video.
- The Privacy Policy URL is not publicly accessible.
- The app stores or logs Pinterest credentials in plaintext or source control.
- The demo uses only wireframes, mocked responses, or a general platform walkthrough.
