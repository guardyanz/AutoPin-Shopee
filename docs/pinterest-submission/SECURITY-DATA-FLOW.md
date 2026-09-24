# Security and data-flow statement

This document is suitable as reviewer support material and as the implementation contract.

## Data flow

```text
Owner selects Shopee Affiliate products
  → extension extracts authorised product metadata locally
  → optional tracking tags are applied through Shopee's own affiliate-link form
  → optional AI provider receives selected product text to draft copy
  → extension renders original posters locally and stores draft batch locally
  → every candidate poster and summary appears in batch review; owner selects each Pin to publish
  → owner confirms the selected batch once; unselected Pins are excluded
  → OAuth access token authorises Pinterest API v5 request
  → Pinterest creates Pin on owner's selected Board
  → app fetches the resulting Pin only to verify the requested action
```

## Controls

- OAuth 2.0 only; no Pinterest password or session-cookie collection.
- Cryptographically random state value bound to each OAuth transaction.
- Client secret and token exchange remain server-side.
- Least-privilege scope set: Boards and Pins read/write only.
- No Pinterest scraping or DOM automation in the API-approved production path.
- No automated engagement actions.
- No autonomous bulk action: each Pin is displayed and individually selected before one batch confirmation.
- No Pinterest API data used in AI prompts, model training, benchmarking, or third-party advertising.
- No cross-user data combination and no sale of data.
- API responses are requested when needed instead of building a Pinterest-data warehouse.
- Local product publication history and Pinterest Pin IDs help prevent accidental duplicate creation.
- If a Create Pin response is ambiguous and no Pin ID was saved, publication pauses for manual account inspection; it is never blindly retried.

## Content responsibility

The owner must have the rights and affiliate authorisation needed for every source product and image. The owner reviews every title, description, alt text, affiliate destination, disclosure, Board, and scheduling rules before selecting a Pin. The app includes `#affiliate` once in the description and does not claim endorsement by Pinterest or Shopee.

## Incident response

If a token or client secret may have been exposed:

1. Revoke or reset the affected credential immediately.
2. Disconnect the account and stop publication requests.
3. Review logs without copying secret values.
4. Remove the leaked material from all repositories and build artifacts.
5. Reconnect through OAuth after remediation.
