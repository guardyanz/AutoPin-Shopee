# OAuth, scopes, and endpoint inventory

## Requested scopes

Request only:

```text
boards:read boards:write pins:read pins:write
```

| Scope | App feature | Endpoint category |
|---|---|---|
| `boards:read` | Show the authenticated owner's Boards and selected Board ID | `GET /v5/boards` |
| `boards:write` | Create a Board only when the owner asks | `POST /v5/boards` |
| `pins:write` | Create a specifically reviewed and approved Pin | `POST /v5/pins` |
| `pins:read` | Verify the created Pin and show its URL/status | `GET /v5/pins/{pin_id}` |

Do not request ads, analytics, audiences, catalogs, secret-board, or user-account scopes for the submitted use case.

## Environments

| Mode | API base | Purpose |
|---|---|---|
| Sandbox/Trial | `https://api-sandbox.pinterest.com/v5` | Test Boards and Pins visible only to their creator |
| Production/Standard | `https://api.pinterest.com/v5` | Production publishing after Standard approval |

## OAuth configuration after Trial approval

Register this exact HTTPS redirect URI backed by the deployed OAuth service:

```text
https://autopin-shopee-oauth.akurindowijayapwt.workers.dev/v1/oauth/pinterest/callback
```

The URI used in the authorisation request and token exchange must exactly match the registered URI and must not issue a second redirect before processing the Pinterest callback.

OAuth authorisation request:

```text
https://www.pinterest.com/oauth/?client_id=<APP_ID>&redirect_uri=<EXACT_URL_ENCODED_REDIRECT_URI>&response_type=code&scope=boards:read,boards:write,pins:read,pins:write&state=<CRYPTOGRAPHIC_RANDOM_STATE>
```

Server-side secrets:

```text
PINTEREST_CLIENT_ID
PINTEREST_CLIENT_SECRET
PINTEREST_REDIRECT_URI
OAUTH_STATE_SECRET
```

Never put the client secret, access token, or refresh token in source code, GitHub Actions logs, screenshots, demo narration, issue reports, or documentation examples.

## Token lifecycle

- Exchange the authorisation code server-side using HTTP Basic authentication.
- Validate `state` before exchange.
- Use the continuous refresh-token flow issued for new apps.
- Refresh before token expiry and rotate to the newest refresh token returned.
- Re-authorise if the token is revoked or the refresh token expires.
- Provide a disconnect/delete operation and tell the owner how to revoke access in Pinterest settings.
