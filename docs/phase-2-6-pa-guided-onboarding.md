# KAI Phase 2.6 PA Guided Onboarding

Phase 2.6 changes the embedded Kai experience from chat-first to guided-first.
Kai now behaves more like a personal setup assistant for vendor acquisition.

The default widget experience:

1. Opens with a visible Kai assistant header.
2. Asks one setup question at a time.
3. Offers quick choices where useful.
4. Shows progress through the website setup flow.
5. Builds a live website preview beside the guided conversation.
6. Generates the structured website draft through the existing
   `/api/kai/website-draft` endpoint.
7. Sends the vendor to registration with `kaiDraftId` when they choose to save.

Chat remains available as a secondary "Ask Kai a side question" surface.

Voice remains disabled. The UI includes a disabled mic placeholder only, so
future push-to-talk or speech support can be added without pretending it exists
today.

Safety boundaries remain unchanged:

- Kai does not submit forms.
- Kai does not create accounts.
- Kai does not publish websites.
- Kai does not approve vendors.
- Kai does not send emails, take payments, or modify production systems.
- Approval gates public launch, marketplace discovery, orders, and payments.
