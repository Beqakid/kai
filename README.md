# KAI

KAI is a reusable Cloudflare-native AI Coach Framework for apps such as Viliniu,
Carehia, CodeHive, and future products.

KAI currently stays deliberately safe: a guide-first assistant framework with a
floating widget, app registration, knowledge loading, workflow scaffolds,
permission-checked actions, multilingual structure, Cloudflare Worker API routes,
and D1 audit/session logging schema.

KAI is not a general chatbot and this build does not include autonomous agents,
wake-word voice, support escalation, production self-modification, advanced
memory, or full automation.

## Phase 1 Architecture

```txt
User
  -> Kai Widget
  -> Cloudflare Worker API
  -> Context Engine
  -> Knowledge Loader
  -> Workflow Engine
  -> AI Provider Layer
  -> Response Generator
  -> D1 Logging
```

## Repository Layout

```txt
packages/
  kai-core/
  kai-ui/
  kai-cloudflare/
  kai-knowledge/
  kai-workflows/
  kai-actions/
  kai-language/
  kai-governance/
  kai-website-builder/
  kai-voice/

integrations/
  viliniu/

knowledge/
  viliniu/
    en/
    es/
    fj/

locales/
  en/
  es/
  fj/

migrations/
  0001_kai_phase1.sql
  0002_seed_viliniu_knowledge.sql
  0003_kai_phase2_workflows.sql
tests/
  kai-worker-routes.test.mjs
  website-builder.test.mjs
```

## Local Development

Install dependencies and validate the workspace:

```bash
npm ci
npm run build
npm test
```

Run the Worker locally:

```bash
npx wrangler dev
```

Open the demo at:

```txt
http://localhost:8787/demo/kai
```

## Viliniu Registration

Viliniu should integrate KAI through an adapter instead of hardcoding Viliniu
logic into `kai-core`.

```ts
import { registerViliniuKai } from "@kai/integration-viliniu";

const kai = registerViliniuKai({
  userId,
  userRole,
  permissions,
  language: "en",
});
```

## Cloudflare

Phase 1 targets Cloudflare Pages for app hosting, Cloudflare Workers for the KAI
API, and Cloudflare D1 for sessions, messages, preferences, audit logs, and
knowledge metadata.

Future placeholders are documented for Durable Objects, Vectorize, R2, AI
Gateway, Queues, and Workflows.

Create the D1 database and update `wrangler.toml`:

```bash
wrangler d1 create kai-db
wrangler d1 migrations apply kai-db --remote
```

Use Cloudflare secrets for provider keys:

```bash
wrangler secret put OPENAI_API_KEY
```

Do not commit secrets.

Required Worker bindings:

- `KAI_DB` D1 database

Required variables:

- `AI_COACH_ENABLED`
- `AI_COACH_MULTILINGUAL`
- `KAI_DEFAULT_LANGUAGE`
- `KAI_DEFAULT_AUTONOMY`
- `KAI_ALLOWED_ORIGINS`

Future disabled bindings remain scaffolded for R2, Vectorize, Durable Objects,
AI Gateway, Queues, and Workflows.

Deployment verification:

```bash
npx wrangler deploy --dry-run
npx wrangler d1 migrations apply kai-db --local
npx wrangler d1 execute kai-db --local --command "SELECT name FROM sqlite_schema WHERE type = 'table' AND name LIKE 'kai_%';"
```

## API Routes

- `POST /api/kai/session`
- `POST /api/kai/message`
- `GET /api/kai/workflows`
- `GET /api/kai/knowledge/sources`
- `POST /api/kai/preferences`
- `GET /api/kai/context`
- `POST /api/kai/workflow-state`
- `POST /api/kai/website-draft`
- `GET /api/kai/website-draft?id=...`
- `POST /api/kai/creative-asset-draft`
- `POST /api/kai/image-draft`
- `POST /api/kai/viliniu/handoff`
- `GET /demo/kai` development demo page for the embedded Viliniu onboarding flow
- `GET /embed/kai.js` embeddable widget script

## Viliniu Demo

`/demo/kai` is the Phase 2.8 demo surface. It loads the embeddable Kai widget,
creates sessions, supports English, Spanish, and Fijian selection, guides a
business through product/service/hybrid onboarding, generates a structured
website draft, and keeps signup/save/publish approval-gated.

If `OPENAI_API_KEY` is configured and `AI_COACH_IMAGE_GENERATION_ENABLED=true`,
Kai can generate a temporary realistic image draft from the website answers.
The image is a preview only: it is not saved to R2, attached to Viliniu data, or
published automatically.

Embed Kai into a Viliniu surface with:

```html
<script
  src="https://kai.jjioji.workers.dev/embed/kai.js"
  data-app="viliniu"
  data-api-base="https://kai.jjioji.workers.dev"
  defer
></script>
```

## Feature Flags

```env
AI_COACH_ENABLED=true
AI_COACH_VOICE_ENABLED=false
AI_COACH_WAKEWORD_ENABLED=false
AI_COACH_MULTILINGUAL=true
AI_COACH_IMAGE_GENERATION_ENABLED=true
AI_COACH_INTERVIEW_MODE=false
AI_COACH_ADAPTIVE_LEARNING=false
AI_COACH_AGENT_MODE=false
AI_COACH_SUPPORT_ESCALATION=false
KAI_DEFAULT_LANGUAGE=en
KAI_DEFAULT_AUTONOMY=GUIDE_ONLY
```

## Safety

KAI Phase 1 may suggest next steps and draft content. It must not submit forms,
delete data, send email, change permissions, process payments, deploy code,
modify schemas, or provide legal, medical, or financial advice as final
authority.

## Phase 2

Phase 2 adds page-aware guidance, Viliniu RBAC permission mapping, workflow-state
tracking, keyword knowledge retrieval from D1 metadata, and draft-only website
generation. Payload/Viliniu remains the source of truth for identity, roles,
ownership, and access control. KAI only receives safe role/context hints and
continues to operate in guide-only mode.

## Phase 2.5

Phase 2.5 adds the Viliniu website preview lead flow. A visitor can open Kai,
draft a simple business website before signup, preview the draft in the widget,
and then go to vendor registration with a `kaiDraftId` reference. Vendors can
keep building while approval is pending; approval only gates public launch,
marketplace visibility, orders, payments, and customer contact. Kai still does
not submit forms, save, publish, or modify Viliniu data automatically.

See `docs/phase-2-5-website-preview-lead-flow.md`.

## Phase 2.6

Phase 2.6 shifts the embedded experience from chat-first to guided-first. Kai
opens as a personal setup assistant, asks one website setup question at a time,
shows progress, builds a live preview, and keeps chat available only as a
secondary side-question surface. Voice remains a disabled placeholder.

See `docs/phase-2-6-pa-guided-onboarding.md`.

For previewing while Viliniu production domains are behind placeholder gates, use
`https://kai.jjioji.workers.dev/demo/kai`. This page is a demo surface only; it
does not publish, save to Viliniu, submit forms, or process payments.

## Phase 2.7

Phase 2.7 adds business-model routing and creative asset scaffolding. Kai now
asks whether customers buy products, request services, or both, then adapts the
website setup flow for product sellers, service providers, or hybrid businesses.
It can prepare logo/product/service image prompts, but image generation, saving,
and publishing remain approval-gated future work.

See `docs/phase-2-7-business-model-creative-assets.md`.

## Phase 2.8

Phase 2.8 stabilizes the Viliniu demo. It verifies TypeScript, Worker dry-run
deployment, local D1 migrations, API route behavior, draft-only website
generation, creative asset draft prompts, CORS responses, and embed safety. The
guided setup now includes a short business story step and improved defaults for
product sellers, service providers, and hybrid businesses.

See `docs/phase-2-8-demo-readiness.md`.

## Future Carehia Notes

Carehia should be integrated through `integrations/carehia` using the same
registration contract. Carehia-specific workflows, knowledge, branding, and
permissions should stay outside `kai-core`.
