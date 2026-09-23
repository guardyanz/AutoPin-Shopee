# Architecture

## Runtime boundaries

- The service worker owns scheduling, checkpoints, state transitions, and provider calls.
- The Shopee content script only reads visible product data and invokes visible affiliate-link controls.
- Pinterest publication uses API v5. The extension has no Pinterest content script and does not scrape Pinterest.
- The offscreen document renders a temporary poster; generated image data is retained in an IndexedDB draft until the approved batch is completed or stopped.
- IndexedDB stores products, jobs, Pin drafts, and verified publication records. Chrome local storage stores settings.

## Source integration

The source adapter combines the resilient selector strategy, pagination behavior,
high-resolution image normalization, and affiliate-link extraction pattern from
ShopiThread with AutoPin's staged batch publishing concept. Adobe Stock URLs and
Adobe Contributor credentials are not part of this repository.

## Publication guarantees

Drafts are gathered into one `awaiting_approval` batch. The owner opens each
preview, individually selects the Pins to publish, and confirms the selected
set once. Unselected drafts cannot reach `POST /v5/pins`. Create Pin is called
once and is never blindly retried after an ambiguous response. A publication is committed only after a
successful Create Pin response and `GET /v5/pins/{pin_id}` verification.
