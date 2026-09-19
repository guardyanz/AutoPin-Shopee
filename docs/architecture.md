# Architecture

## Runtime boundaries

- The service worker owns scheduling, checkpoints, state transitions, and provider calls.
- The Shopee content script only reads visible product data and invokes visible affiliate-link controls.
- The Amazon backend holds Creators API credentials server-side and returns only ASIN, title, and the Amazon Special Link. It does not request image resources.
- Pinterest publication uses API v5. The extension has no Pinterest content script and does not scrape Pinterest.
- The offscreen document renders a temporary poster; generated image data is cleared after each product.
- IndexedDB stores products, jobs, and verified publication records. Chrome local storage stores settings.

## Source integration

The Shopee adapter combines the resilient selector strategy, pagination behavior,
high-resolution image normalization, and affiliate-link extraction pattern from
ShopiThread with AutoPin's staged publishing concept. The Amazon adapter uses the
Creators API through a private PHP service and creates an original poster locally
when the user does not provide an owned image. Adobe Stock URLs and Adobe
Contributor credentials are not part of this repository.

## Publication guarantees

Every draft enters `awaiting_approval`; the owner must approve that specific Pin
before `POST /v5/pins` can run. Create Pin is called once and is never blindly
retried after an ambiguous response. A publication is committed only after a
successful Create Pin response and `GET /v5/pins/{pin_id}` verification.
