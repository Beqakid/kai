# KAI Phase 2

Phase 2 makes KAI more useful inside Viliniu while keeping it non-autonomous.

Included:

- Page-aware context from the current URL, path, and document title.
- App-surface detection for landing, storefront, vendor, admin, and delivery.
- Viliniu role-to-KAI permission mapping that respects Payload RBAC as the
  source of truth.
- Workflow-state API for current step, completed steps, and status.
- D1-backed workflow-state migration.
- Keyword knowledge-source retrieval from D1 metadata.
- Draft-only AI website builder output with audit logging.
- CORS allowlist for Viliniu production and Pages domains.
- Universal embed quick actions: explain page, show workflows, website draft.

Deployment note:

- Apply `migrations/0003_kai_phase2_workflows.sql` before relying on
  `POST /api/kai/workflow-state`.
- The GitHub Actions workflow `Apply KAI D1 migrations` can run the migration
  with `CLOUDFLARE_ID` and `CLOUDFLARE_TOKEN_API` repository secrets.

Still out of scope:

- Form submission.
- Auto-saving or publishing websites.
- Permission changes.
- Payments.
- Emails.
- Deployments.
- Wake-word voice.
- Autonomous agents.
- Advanced memory or production self-modification.

Viliniu should enforce all server-side actions through Payload access control.
When a logged-in user is passed to Payload Local API calls, use
`overrideAccess: false`.
