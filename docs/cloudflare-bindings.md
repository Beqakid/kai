# Cloudflare Bindings

Required in Phase 1:

- `KAI_DB`: Cloudflare D1 database binding.
- `OPENAI_API_KEY`: Cloudflare secret for the initial OpenAI provider.
- `KAI_DEFAULT_LANGUAGE`: default language code, usually `en`.
- `AI_COACH_ENABLED`: enables or disables KAI.
- `AI_COACH_MULTILINGUAL`: enables language routing and selector support.

Future bindings:

- `KAI_R2`: future file and asset storage.
- `KAI_VECTORIZE`: future semantic search index.
- `KAI_SESSION_DO`: future Durable Object for stateful sessions.
- `KAI_QUEUE`: future background tasks.
- `KAI_WORKFLOW`: future orchestration.

KAI should route AI calls through the provider abstraction. AI Gateway can be
added later without changing app adapters.
