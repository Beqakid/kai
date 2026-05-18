# KAI Phase 2.5 Website Preview Lead Flow

Phase 2.5 turns Kai into a pre-signup acquisition helper for Viliniu vendors.
The goal is to let a business see value before being asked to create an
account.

Flow:

1. A visitor opens Kai on a Viliniu public or vendor page.
2. The visitor chooses `Website preview`.
3. Kai collects lightweight business details in the widget.
4. Kai generates a draft-only one-page website preview.
5. Kai shows the draft in the widget.
6. Kai offers `Create account to save`.
7. The visitor is sent to the Viliniu vendor registration page with a draft
   reference in the URL.
8. The vendor can keep building store details, products, and services while
   approval is pending.

This is still guide-only. Kai does not create accounts, submit forms, publish
websites, send emails, take payments, or change Viliniu data.

Approval should gate public launch, marketplace visibility, orders, payments,
and customer contact. Approval should not block drafting, profile setup, product
setup, service setup, or private previews.

## Draft Persistence

`POST /api/kai/website-draft` now returns a `draftId`. The draft is stored as
an approved audit-log record with action `generate_website_draft`.

`GET /api/kai/website-draft?id=<draftId>` can retrieve the draft for future
Viliniu integration. This lets the vendor app attach a pre-signup draft to a
new vendor profile later without changing KAI core.

## Signup Handoff

The embedded widget links to:

```txt
https://vendor.viliniu.com/register?kaiDraftId=<draftId>
```

Viliniu should later read `kaiDraftId` after signup and attach the draft to the
vendor profile as pending, unpublished content. Payload RBAC remains the source
of truth for saving and publishing.

## Safety

- Draft generation is permission checked.
- Website output is draft-only.
- Approval is required before public launch, marketplace discovery, orders, and
  payments.
- Kai never submits the vendor registration form.
- Kai never modifies production systems by itself.
