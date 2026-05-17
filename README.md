# KAI

KAI is a reusable Cloudflare-native AI Coach Framework for apps such as Viliniu,
Carehia, CodeHive, and future products.

Phase 1 keeps KAI deliberately simple: a guide-first assistant framework with a
floating widget, app registration, knowledge loading, workflow scaffolds,
permission-checked actions, multilingual structure, Cloudflare Worker API routes,
and D1 audit/session logging schema.

KAI is not a general chatbot and Phase 1 does not include autonomous agents,
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
wrangler d1 migrations apply kai-db
```

Use Cloudflare secrets for provider keys:

```bash
wrangler secret put OPENAI_API_KEY
```

Do not commit secrets.

## API Routes

- `POST /api/kai/session`
- `POST /api/kai/message`
- `GET /api/kai/workflows`
- `GET /api/kai/knowledge/sources`
- `POST /api/kai/preferences`

## Feature Flags

```env
AI_COACH_ENABLED=true
AI_COACH_VOICE_ENABLED=false
AI_COACH_WAKEWORD_ENABLED=false
AI_COACH_MULTILINGUAL=true
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

## Future Carehia Notes

Carehia should be integrated through `integrations/carehia` using the same
registration contract. Carehia-specific workflows, knowledge, branding, and
permissions should stay outside `kai-core`.
