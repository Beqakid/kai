# Phase 2.7: Business Model and Creative Assets Scaffold

Phase 2.7 makes Kai route onboarding by business model before asking for website
content.

## Business Models

Kai now classifies a Viliniu business as:

- `product_seller`: customers buy products through a store flow.
- `service_provider`: customers request bookings, quotes, or skilled services.
- `hybrid`: customers can buy products and request services.

The embedded guide asks this directly first, then adapts the offerings question
and website draft structure.

## Creative Asset Scaffold

Kai can now prepare draft-only creative prompts for:

- logos
- product images
- service banner images
- website hero images
- social promo images

The Worker exposes `POST /api/kai/creative-asset-draft`, which returns a prompt
and audit log record only. It does not generate an image, save media, publish,
or attach assets to Viliniu.

## Approval Boundary

Generated or suggested images must remain approval-gated:

1. Kai drafts the prompt or image idea.
2. The user reviews and approves.
3. A future image provider may generate an image.
4. A future R2 storage layer may save approved assets.
5. Viliniu still requires explicit user or admin approval before public use.

## Future Work

- Add `KaiImageProvider` implementations.
- Route through OpenAI or another image provider abstraction.
- Store approved files in Cloudflare R2.
- Store metadata in D1.
- Add moderation and brand-safety checks before saving.
- Keep generated assets out of production pages until approved.
