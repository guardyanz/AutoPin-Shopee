# Architecture

## Runtime boundaries

- The service worker owns scheduling, checkpoints, state transitions, and provider calls.
- The Shopee content script only reads visible product data and invokes visible affiliate-link controls.
- The Pinterest content script fills visible controls and verifies the publication result.
- The offscreen document renders a temporary poster; generated image data is cleared after each product.
- IndexedDB stores products, jobs, and verified publication records. Chrome local storage stores settings.

## Source integration

The source adapter combines the resilient selector strategy, pagination behavior,
high-resolution image normalization, and affiliate-link extraction pattern from
ShopiThread with AutoPin's staged batch publishing concept. Adobe Stock URLs and
Adobe Contributor credentials are not part of this repository.

## Publication guarantees

The state machine does not retry an unverified Publish click. A publication is
committed only after Pinterest returns a confirmation signal or a Pin URL. This
reduces duplicate Pins after ambiguous browser or network failures.
