# KAI Phase 2.8 Demo Readiness

Phase 2.8 turns the existing Kai scaffold into a deployable and testable Viliniu
onboarding demo. It does not change the architecture or autonomy model.

## What Works

- `GET /demo/kai` loads a Viliniu onboarding surface.
- `GET /embed/kai.js` injects one guarded widget instance.
- `POST /api/kai/session` creates D1-backed sessions.
- `POST /api/kai/message` logs user and assistant messages.
- `GET /api/kai/workflows` returns the workflow registry.
- `GET /api/kai/knowledge/sources` returns enabled D1 knowledge metadata.
- `POST /api/kai/preferences` stores preferred language.
- `POST /api/kai/workflow-state` stores guide progress.
- `POST /api/kai/website-draft` generates structured website drafts.
- `GET /api/kai/website-draft?id=...` retrieves approved draft-only audit rows.
- `POST /api/kai/creative-asset-draft` creates logo/image prompt drafts.
- `POST /api/kai/image-draft` creates temporary realistic image previews when enabled.
- `POST /api/kai/viliniu/handoff` records audit-only signup handoff metadata.

## Demo Flow

Kai asks one calm setup question at a time:

1. Business model: products, services, or both.
2. Business name.
3. Business type.
4. Products or services.
5. Location/service area.
6. Contact path.
7. Brand style.
8. Short business story.
9. Preferred customer action.

The output is a structured draft only. It includes headline/tagline, about copy,
product/service sections, contact section, CTA, SEO title and description,
suggested colors, logo prompt, and creative asset prompt drafts.

When image generation is enabled, the final preview also includes a button to
generate a realistic website image draft from the same business answers. This
is user-triggered and approval-gated.

## Safety

Kai remains `GUIDE_ONLY`.

Kai can guide, explain, suggest, classify, prepare content, and create draft
outputs. It must not publish websites, submit forms, send email, process
payments, modify roles, change schema, approve vendors, or change production
systems.

## Validation Commands

```bash
npm run build
npm test
npx wrangler deploy --dry-run
npx wrangler d1 migrations apply kai-db --local
```

Optional local D1 smoke test:

```bash
npx wrangler d1 execute kai-db --local --command "INSERT OR REPLACE INTO kai_user_preferences (id, app, user_id, preferred_language, preferences_json) VALUES ('phase28_pref', 'viliniu', 'phase28_user', 'es', '{}'); UPDATE kai_user_preferences SET preferred_language = 'fj' WHERE id = 'phase28_pref'; SELECT id, app, user_id, preferred_language FROM kai_user_preferences WHERE id = 'phase28_pref';"
```

## Cloudflare Setup

Required:

- Worker name: `kai`
- D1 binding: `KAI_DB`
- D1 database: `kai-db`
- D1 database id: `c00f52df-b774-45d2-b39d-1f1666dc3844`
- Secret: `OPENAI_API_KEY` for real OpenAI responses
- Variable: `AI_COACH_IMAGE_GENERATION_ENABLED=true` to allow temporary image drafts

The mock provider works when `OPENAI_API_KEY` is not set, which keeps demos and
tests stable.

## Image Drafts

Kai uses OpenAI image generation for realistic image drafts only after the user
explicitly requests one. The current route returns a temporary base64/data URL
preview and logs the event to D1 audit logs. It does not save to R2, change
Viliniu records, publish the image, or reuse it without future user approval.

## Future Extension Points

Voice, wake-word, interview mode, adaptive learning, support escalation, agents,
automation, publishing, Vectorize, R2, Durable Objects, Queues, and Workflows
remain scaffolded but disabled.
