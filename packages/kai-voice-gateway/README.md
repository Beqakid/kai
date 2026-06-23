# Kai Voice Gateway

Cloudflare Worker that powers Kai's voice interface across Jon Command Center, Carehia, Viliniu, and Volau.

## Architecture

```
User taps orb → KaiVoiceOrb (React) → Kai Voice Gateway (CF Worker)
                                        ├── Auth + Rate Limiting
                                        ├── STT Provider (Cloudflare AI / Whisper / Deepgram)
                                        ├── KaiCoreService (safety guardrails + intent detection)
                                        ├── TTS Provider (Cloudflare AI / OpenAI / ElevenLabs)
                                        ├── D1 Logging (sessions + interactions)
                                        └── Response → Frontend plays audio + shows text
```

## Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/kai/voice/session` | ✅ | Create a voice session |
| POST | `/api/kai/voice/transcribe` | ✅ | Transcribe audio to text |
| POST | `/api/kai/voice/respond` | ✅ | Get Kai response + TTS audio |
| GET | `/api/kai/voice/history` | ✅ Admin | Paginated voice interaction history |
| GET | `/api/kai/action-receipts` | ✅ Super-admin | Paginated action receipt audit log |
| GET | `/health` | ❌ | Health check |

## Security

### Authentication (JWT — Phase 2)
All voice routes require a `Bearer` token in the `Authorization` header.

**Production mode** (default):
- Tokens are verified as HMAC-SHA256 (HS256) JWTs using `KAI_AUTH_SECRET`.
- The JWT must contain these claims:

| Claim | Type | Required | Description |
|-------|------|----------|-------------|
| `sub` | string | ✅* | User ID (preferred over `userId`) |
| `userId` | string | ✅* | User ID (fallback if `sub` is absent) |
| `appId` | string | ✅ | Must match a valid app ID |
| `userRole` | string | ✅ | Must match a valid role |
| `iat` | number | ✅ | Issued-at (Unix seconds) |
| `exp` | number | ✅ | Expiration (Unix seconds) |

\* At least one of `sub` or `userId` must be present. `sub` takes precedence.

- **Token identity is authoritative.** `userId`, `appId`, and `userRole` come from the verified token — not from the request body.
- If the request body contains `appId` or `userRole` that conflicts with the token claims, the request is rejected (403).
- Non-empty random strings no longer authenticate. Only valid signed JWTs are accepted.

**Local/dev mode:**
- Set `KAI_ALLOW_DEMO_TOKEN=true` in `wrangler.toml` or environment to accept the literal string `demo-token` without JWT verification.
- `demo-token` returns a fixed identity: `demo-user-001` / `jon-command-center` / `super-admin`.
- **Never enable this flag in production.**

**Required secret:**
```bash
# Set the JWT signing secret (minimum 32 characters recommended)
wrangler secret put KAI_AUTH_SECRET
```

### Rate Limiting
- 30 requests per user per minute (sliding window)
- Returns HTTP 429 when exceeded

### Audio Limits
- **Max file size:** 10 MB
- **Max duration:** 120 seconds (2 minutes)
- Raw audio is **never stored** by default (`ENABLE_KAI_AUDIO_STORAGE=false`)

### Server-Side Validation
- `appId` must be one of: `jon-command-center`, `carehia`, `viliniu`, `volau`
- `userRole` must be one of: `super-admin`, `admin`, `vendor`, `customer`, `viewer`
- `allowedActions` are **intersected with the server-side registry** — client values are never trusted directly
- Request body size is limited to 1 MB for JSON endpoints

### Sensitive Action Blocklist
Kai Voice v1 **cannot** perform:
1. Process payments / issue refunds
2. Change payout or bank details
3. Delete users
4. Approve background checks or identity verification
5. Deploy to production
6. Modify database schemas
7. Grant/revoke admin access
8. Transfer funds or modify billing

### No-Background-Listening Guarantee
- No wake word detection
- No always-on microphone
- No streaming audio endpoint
- Recording starts **only** from explicit user tap
- Audio is a discrete blob, not a stream

## Kai Action Receipts (Phase 3)

Every Kai recommendation, action, escalation, blocked action, and generated output creates an auditable receipt in the `kai_action_receipts` D1 table. This is the foundation for the future ProofTrust Engine.

### What Gets Logged

| Receipt Type | When Created |
|---|---|
| `kai_recommendation_generated` | "help me out" selects a top task |
| `kai_action_prepared` | Action drafted, awaiting confirmation |
| `kai_action_executed` | Safe action auto-executed |
| `kai_action_blocked` | Blocked action attempted (via allowedActions or NL pattern) |
| `kai_escalated_to_admin` | Action escalated to admin |
| `kai_risk_warning` | Sensitive NL pattern detected in transcript |
| `kai_explanation_generated` | Kai answers a status/help/screen question |
| `kai_task_status_changed` | Task skipped, marked done, or status updated |
| `kai_tasklet_prompt_generated` | Tasklet prompt generated for a task |
| `kai_blocker_summary_generated` | Blocker summary generated |
| `kai_admin_note_drafted` | Admin note drafted |
| `kai_user_message_drafted` | User message drafted |
| `kai_github_issue_drafted` | GitHub issue drafted |

### What Does NOT Get Logged
- **Authorization tokens** — never stored in receipts
- **Raw audio data** — never stored
- **Secrets or API keys** — never stored
- **Private documents** — receipt stores only summaries

### How This Prepares Kai for ProofTrust
Action receipts create an immutable audit trail that will feed into the ProofTrust Engine. Every recommendation and action has a receipt with:
- Who (userId, userRole)
- What (receiptType, actionType, actionSummary)
- Where (appId, currentScreen)
- Why (riskLevel, requiresConfirmation, approvalStatus)
- When (createdAt)

### Running Migration 0003
```bash
wrangler d1 execute kai-voice --file=./migrations/0003_kai_action_receipts.sql
```

### Querying Receipts

`GET /api/kai/action-receipts` — **super-admin only**

| Param | Type | Description |
|-------|------|-------------|
| `appId` | string | Filter by app ID |
| `userId` | string | Filter by user ID |
| `receiptType` | string | Filter by receipt type |
| `riskLevel` | string | Filter by risk level |
| `taskId` | string | Filter by task ID |
| `page` | number | Page number (default: 1) |
| `pageSize` | number | Page size (default: 20, max: 100) |

```bash
curl -H "Authorization: Bearer $JWT" \
  "https://kai.example.com/api/kai/action-receipts?riskLevel=blocked&page=1"
```

## Kai Permission and Risk Gate (Phase 4)

Every Kai action must pass through the **KaiPermissionGate** before it is prepared, executed, blocked, escalated, or logged. The gate is the central safety layer between user intent and Kai action execution.

### What the Gate Does

The gate evaluates every action request and returns a decision with:
- **allowed** — whether the action may proceed
- **riskLevel** — `low`, `medium`, `high`, or `blocked`
- **requiresConfirmation** — whether the user must confirm before execution
- **requiresAdminApproval** — whether manual admin approval is needed
- **reason** — human-readable explanation
- **recommendedFallback** — what the user should do instead (if denied)

### Why It Exists

Before Phase 4, safety checks were spread across multiple services (KaiCoreService, safe-actions, orchestrator). The gate centralizes all permission and risk decisions into a single evaluator, ensuring:
- No action bypasses safety checks
- Consistent risk classification across all entry points
- Every denied action creates an auditable receipt
- Client-provided `allowedActions` are never trusted (server-side intersection only)

### Risk Classification

| Risk Level | Actions | Behavior |
|---|---|---|
| **Low** | `generate_tasklet_prompt`, `summarize_blockers`, `draft_admin_note`, `mark_reviewed` | Auto-execute |
| **Medium** | `draft_github_issue`, `draft_user_message`, `update_status`, `create_task` | Requires user confirmation |
| **High** | `change_user_permissions`, `modify_production_state`, `bulk_update_records`, etc. | Requires admin approval; **does not execute** in Kai v1 |
| **Blocked** | `deploy_code`, `process_payment`, `delete_user`, `grant_admin`, `transfer_funds`, `truncate_table`, + 11 more | **Always denied**; permanently blocked |

### Blocked Actions (17 total)

`deploy_code`, `modify_production_schema`, `delete_user`, `process_payment`, `issue_refund`, `change_payout`, `change_bank_details`, `approve_background_check`, `approve_identity_verification`, `send_external_email`, `change_compliance_settings`, `modify_security_rules`, `grant_admin`, `revoke_access`, `transfer_funds`, `delete_database`, `truncate_table`

### Where the Gate Is Applied

1. **`KaiTaskOrchestrator.executeAction()`** — before any safe action executes
2. **`KaiTaskOrchestrator.doNext()`** — before "go ahead" / "continue" / "do it" runs
3. **`KaiTaskOrchestrator.helpMeOut()`** — pre-evaluates the suggested action
4. **`KaiCoreService.processRequest()`** — sensitive NL requests route through the gate
5. **`ActionReceiptLogger`** — receipts include gate decision metadata (`gateAllowed`, `gateRiskLevel`, `gateReason`, `gateRequiresConfirmation`, `gateRequiresAdminApproval`)

### How This Prepares Kai for ProofTrust

The gate is the foundation for the future ProofTrust Engine:
- Every gate decision is recorded as a receipt → full audit trail
- Risk classification can be refined as Kai capabilities expand
- The confirmation/approval flow maps directly to ProofTrust verification chains
- Gate metadata in receipts enables compliance reporting and risk analysis

### Why Sensitive Actions Remain Blocked

Kai v1 is a voice-first assistant. Sensitive operations (payments, user deletion, deploys, etc.) require multi-factor verification, audit trails, and human-in-the-loop confirmation that cannot be safely provided through voice commands alone. These will only be unblocked when the full ProofTrust Engine provides cryptographic verification and multi-party approval.

### API Response Gate Metadata

When an action is evaluated by the gate, the API response includes:

```json
{
  "gateDecision": {
    "riskLevel": "medium",
    "requiresConfirmation": true,
    "requiresAdminApproval": false,
    "reason": "Action requires confirmation before execution.",
    "recommendedFallback": "Review the drafted output before confirming."
  }
}
```

## Kai Pending Confirmation Workflow (Phase 5)

Phase 5 adds a real confirmation lifecycle for medium-risk actions. Actions are prepared but **not executed** until the authenticated user explicitly confirms.

### Action Lifecycle by Risk Level

| Risk | Behavior | Lifecycle |
|---|---|---|
| **Low** | Auto-execute | gate → execute → receipt |
| **Medium** | Pending confirmation | gate → prepare → store pending → **user confirms or denies** → re-gate → execute (or deny) → receipt |
| **High** | Admin approval required (denied in v1) | gate → deny → receipt |
| **Blocked** | Always denied | gate → deny → receipt |

### Pending Action Status Flow

```
pending → confirmed → executed
pending → denied
pending → expired
```

### D1 Table

`kai_pending_actions` stores pending actions with:
- `id` — unique `pa_` prefixed ID
- `status` — pending / confirmed / denied / expired / executed
- `expires_at` — 15-minute default expiration
- `prepared_output` — the drafted action content
- `gate_decision_json` — original gate decision snapshot
- `confirmed_by` / `denied_by` — who resolved the action

### New API Routes

#### `GET /api/kai/actions/pending`

List pending actions for the authenticated user. Super-admins can filter by `appId`, `userId`, `status`, `taskId`.

#### `POST /api/kai/actions/:id/confirm`

Confirm and execute a pending medium-risk action. Re-runs the Permission Gate before execution. If the gate decision has changed, execution is blocked.

#### `POST /api/kai/actions/:id/deny`

Deny a pending action and create a denial receipt.

### Safety Rules

1. Only medium-risk actions can enter the pending flow.
2. High-risk and blocked actions are **never** stored as pending.
3. Pending actions expire after 15 minutes.
4. Only the owning user or super-admin can confirm/deny.
5. Confirmation **re-runs** the Permission Gate — changed decisions block execution.
6. All confirm/deny/expire events create Action Receipts.
7. Never stores tokens, secrets, raw audio, or private documents.

### New Receipt Types

| Type | When |
|---|---|
| `kai_action_confirmed` | Pending action is confirmed |
| `kai_action_denied` | Pending action is denied (user or gate re-check) |
| `kai_action_expired` | Pending action expires without resolution |

### OrchestratorResponse Additions

```json
{
  "pendingActionId": "pa_abc123",
  "pendingActionStatus": "pending",
  "expiresAt": "2026-06-23T03:45:00.000Z",
  "gateDecision": { ... }
}
```

## Environment Variables

### Required
| Variable | Description | Default |
|----------|-------------|---------|
| `KAI_STT_PROVIDER` | STT engine | `cloudflare-ai` |
| `KAI_TTS_PROVIDER` | TTS engine | `cloudflare-ai` |
| `KAI_CORE_PROVIDER` | Kai response engine | `kai-core` |
| `ENABLE_KAI_AUDIO_STORAGE` | Store raw audio in R2 | `false` |
| `KAI_ALLOW_DEMO_TOKEN` | Accept demo-token (dev only) | _(unset / false)_ |

### Optional
| Variable | Description |
|----------|-------------|
| `KAI_TTS_VOICE` | Voice name override (e.g. `en_us-female`) |
| `KAI_TTS_LANGUAGE` | Language code (default: `en`) |
| `KAI_TTS_SPEED` | Speech speed 0.5–2.0 (default: `1.0`) |

### Secrets (set via `wrangler secret put`)
| Secret | Required For |
|--------|-------------|
| `KAI_AUTH_SECRET` | JWT verification (production) |
| `OPENAI_API_KEY` | `whisper` STT or `openai-tts` TTS |
| `DEEPGRAM_API_KEY` | `deepgram` STT |
| `ELEVENLABS_API_KEY` | `elevenlabs` TTS |

## Provider Swap Instructions

### STT Provider
```toml
# In wrangler.toml:
KAI_STT_PROVIDER = "cloudflare-ai"  # Free, runs on edge
# KAI_STT_PROVIDER = "whisper"      # OpenAI Whisper (needs OPENAI_API_KEY)
# KAI_STT_PROVIDER = "deepgram"     # Deepgram (needs DEEPGRAM_API_KEY)
# KAI_STT_PROVIDER = "mock"         # Returns mock transcript
```

### TTS Provider
```toml
KAI_TTS_PROVIDER = "cloudflare-ai"  # Free, MeloTTS on edge
# KAI_TTS_PROVIDER = "openai-tts"   # OpenAI TTS (needs OPENAI_API_KEY)
# KAI_TTS_PROVIDER = "elevenlabs"   # ElevenLabs (needs ELEVENLABS_API_KEY)
# KAI_TTS_PROVIDER = "mock"         # Returns no audio
```

## D1 Database Setup

```bash
# Create the database
wrangler d1 create kai-voice

# Update wrangler.toml with the database_id from the output

# Run the migration
wrangler d1 execute kai-voice --file=./migrations/0001_kai_voice_tables.sql

# For local development
wrangler d1 execute kai-voice --local --file=./migrations/0001_kai_voice_tables.sql
```

### Tables
- `kai_voice_sessions` — session metadata (app, user, role, providers, timestamps)
- `kai_voice_interactions` — every voice interaction (transcript, response, risk level, providers, errors)

## Deployment

```bash
# Install dependencies
npm install

# Local development
wrangler dev

# Deploy
wrangler deploy

# Set secrets
wrangler secret put KAI_AUTH_SECRET
wrangler secret put OPENAI_API_KEY
```

---

## Frontend: KaiVoiceOrb

### Props

```tsx
interface KaiVoiceOrbProps {
  appId: string;          // 'jon-command-center' | 'carehia' | 'viliniu' | 'volau'
  userId: string;         // Authenticated user ID
  userRole: string;       // 'super-admin' | 'admin' | 'vendor' | 'customer' | 'viewer'
  currentScreen: string;  // Current screen/page identifier
  authToken: string;      // Bearer token for gateway auth
  allowedActions: string[]; // Actions this user can perform (validated server-side)
  gatewayUrl?: string;    // Gateway base URL (default: '/api/kai/voice')
  useMockGateway?: boolean; // Use mock responses (default: true)
  onStateChange?: (state: OrbState) => void;
  onAudioCaptured?: (blob: Blob) => void;
}
```

## Kai Tasks Panel — Jon Command Center (Phase 6)

### Overview

`KaiTasksPanel` is the primary integration component for Jon Command Center.
It surfaces all Kai capabilities in a single panel:

| Section | Description |
|---------|-------------|
| **Command Header** | Kai status, current app/role, gateway connection, safety notice |
| **Top Priority Card** | Highest-priority actionable task with score, risk level, gate decision |
| **Task Priority Groups** | Tasks grouped by Critical / High / Medium / Low |
| **Pending Confirmations** | Actions awaiting user confirm/deny (from Phase 5) |
| **Recent Action Receipts** | Auditable receipt log with filters (from Phase 3) |
| **Help Me Out** | Kai recommendation flow with gate decision display |
| **Next Command Box** | Free-text command input with quick-action suggestions |

### Required API Routes

The panel calls these gateway routes (all require a valid JWT in `Authorization: Bearer <token>`):

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/kai/tasks` | GET | List tasks (optional `?priority=` filter) |
| `/api/kai/tasks/:id/action` | POST | Execute task action |
| `/api/kai/orchestrator/help-me-out` | POST | Get Kai recommendation |
| `/api/kai/orchestrator/next` | POST | Send text command |
| `/api/kai/actions/pending` | GET | List pending confirmations |
| `/api/kai/actions/:id/confirm` | POST | Confirm a pending action |
| `/api/kai/actions/:id/deny` | POST | Deny a pending action |
| `/api/kai/action-receipts` | GET | List recent receipts (admin only) |

### Auth Token

Set the auth token via:
- `window.__KAI_AUTH_TOKEN__` (runtime injection)
- `NEXT_PUBLIC_KAI_AUTH_TOKEN` env var

The gateway URL defaults to `https://kai-voice-gateway.jjioji.workers.dev` and
can be overridden via `window.__KAI_GATEWAY_URL__`.

### Pending Confirmation Behavior

When a medium-risk action is triggered:
1. The orchestrator creates a pending action (15-minute TTL)
2. The panel switches to the **Pending** tab automatically
3. The user sees the action details, gate decision, and expiry countdown
4. **Confirm** re-validates through the Permission Gate, then executes
5. **Deny** marks the action as denied with a receipt
6. Expired actions cannot be confirmed

### Receipt Panel Behavior

The receipts panel shows the last 30 action receipts with filters for:
- Receipt type (executed, blocked, confirmed, denied, expired, etc.)
- Risk level (low, medium, high, blocked)
- Task ID

### Risk Label System

| Risk Level | Label | Description |
|------------|-------|-------------|
| `low` | Low Risk | Safe to execute |
| `medium` | Medium Risk | Confirmation required |
| `high` | High Risk | Admin approval required |
| `blocked` | Blocked | Not allowed |

### Safety Model

- The UI **does not bypass** the Permission and Risk Gate
- Medium-risk actions **create pending confirmations** — never auto-execute
- High-risk and blocked actions are **denied by the gateway** — the UI shows the denial reason
- All actions produce auditable receipts

### Usage

```tsx
import KaiTasksPanel from "@/components/kai/KaiTasksPanel";

export default function Dashboard() {
  return <KaiTasksPanel />;
}
```

### Integration Examples

#### Jon Command Center
```tsx
<KaiVoiceOrb
  appId="jon-command-center"
  userId={currentUser.id}
  userRole={currentUser.role}
  currentScreen="dashboard"
  authToken={session.token}
  allowedActions={['view', 'edit', 'manage-users', 'manage-vendors']}
  gatewayUrl="https://kai-voice-gateway.your-domain.workers.dev/api/kai/voice"
  useMockGateway={false}
/>
```

#### Carehia Super Admin
```tsx
<KaiVoiceOrb
  appId="carehia"
  userId={admin.id}
  userRole="super-admin"
  currentScreen="clients"
  authToken={admin.token}
  allowedActions={['view', 'edit', 'manage-clients', 'manage-schedules']}
  gatewayUrl="https://kai-voice-gateway.your-domain.workers.dev/api/kai/voice"
  useMockGateway={false}
/>
```

#### Viliniu Admin / Vendor
```tsx
// Admin
<KaiVoiceOrb
  appId="viliniu"
  userId={admin.id}
  userRole="admin"
  currentScreen="products"
  authToken={admin.token}
  allowedActions={['view', 'edit', 'manage-products', 'manage-orders']}
  gatewayUrl={GATEWAY_URL}
  useMockGateway={false}
/>

// Vendor
<KaiVoiceOrb
  appId="viliniu"
  userId={vendor.id}
  userRole="vendor"
  currentScreen="products"
  authToken={vendor.token}
  allowedActions={['view', 'edit', 'manage-products']}
  gatewayUrl={GATEWAY_URL}
  useMockGateway={false}
/>
```

#### Volau Admin
```tsx
<KaiVoiceOrb
  appId="volau"
  userId={admin.id}
  userRole="admin"
  currentScreen="dashboard"
  authToken={admin.token}
  allowedActions={['view', 'edit', 'manage-users']}
  gatewayUrl={GATEWAY_URL}
  useMockGateway={false}
/>
```

### Admin Voice History
The `VoiceHistory` component is available for super-admin users:

```tsx
import { VoiceHistory } from './components/VoiceHistory';

// Only render for super-admin
{user.role === 'super-admin' && (
  <VoiceHistory
    gatewayUrl={GATEWAY_URL}
    authToken={session.token}
    userRole={user.role}
    useMock={false}
  />
)}
```

Shows: timestamp, app, role, transcript, Kai response, providers, risk level, errors.
Supports filtering by app and risk level.
Non-admin users see an access denied message.

## ProofTrust Bridge Lite (Phase 7)

### What It Is

The ProofTrust Bridge is a reusable interface layer that sits between Kai's existing safety infrastructure (Permission Gate, Action Receipts, Pending Confirmation Workflow) and the future ProofTrust Engine. It provides a clean, app-agnostic contract so Kai's safety decisions, receipts, approvals, and risk evaluations can later be routed through a centralized trust engine without code changes to each app.

### What It Does Now

- **`ProofTrustBridge` interface** — defines 11 methods covering the full action lifecycle: `createReceipt`, `evaluateAction`, `requireApproval`, `recordBlockedAction`, `recordAiRecommendation`, `recordPreparedAction`, `recordConfirmedAction`, `recordDeniedAction`, `recordExpiredAction`, `recordExecutedAction`, `getTrustStatus`.
- **`ProofTrustBridgeLite` implementation** — a lightweight bridge that:
  - Uses existing Kai Action Receipts (D1 `kai_action_receipts` table) as the receipt backend.
  - Mirrors gate decisions from `KaiPermissionGate` — the gate remains authoritative.
  - Enriches receipt metadata with ProofTrust-shaped fields (`proofTrustBridgeVersion`, `proofTrustDecision`, `proofTrustReceiptType`, `targetType`, `targetId`, `tenantId`).
  - Maps all 15+ Kai receipt types to generic ProofTrust receipt types (e.g. `kai_action_blocked` → `ai_action_blocked`).
  - Sends lifecycle events for every pending action state change (prepared, confirmed, denied, expired, executed).
  - Sanitizes metadata to prevent storage of tokens, secrets, raw audio, or private documents.
- **`GET /api/kai/prooftrust/status`** — super-admin-only route showing bridge mode, engine connection status, supported apps/receipt types/risk levels, and version.
- **`POST /api/kai/prooftrust/evaluate`** — super-admin-only route for testing ProofTrust evaluation without executing an action.

### What It Does NOT Do Yet

- Does not connect to an external ProofTrust Engine service.
- Does not create new production trust tables.
- Does not execute actions — only records and evaluates.
- Does not override the Permission Gate or Pending Confirmation Workflow.
- Does not contain app-specific trust logic (no Carehia, Viliniu, Volau, or JCC rules).

### How It Prepares Kai for the Full ProofTrust Engine

The bridge establishes the data contract and integration points now so the future full engine can:
1. **Replace `ProofTrustBridgeLite`** with a full implementation that satisfies the same `ProofTrustBridge` interface.
2. **Route receipts** to a dedicated ProofTrust receipt store instead of `kai_action_receipts`.
3. **Evaluate actions** using external rule packs instead of mirroring the local gate.
4. **Connect Carehia, Viliniu, Volau, and JCC** through app-specific rule packs that plug into the generic interface — no hardcoded logic needed.

### Why App-Specific Rules Should Not Be Hardcoded

Each app (Carehia, Viliniu, Volau, Jon Command Center) has different trust requirements, risk thresholds, and compliance needs. Hardcoding these into the bridge would:
- Create tight coupling between the trust layer and individual apps.
- Make it impossible to update one app's rules without redeploying the whole gateway.
- Violate separation of concerns.

Instead, the full ProofTrust Engine will support **rule packs** — pluggable, per-app trust configurations that the bridge loads dynamically.

### ProofTrust Types

All types are in `src/prooftrust/types.ts`:

| Type | Purpose |
|---|---|
| `ProofTrustAppId` | Application identifier |
| `ProofTrustTenantId` | Optional multi-tenant identifier |
| `ProofTrustActor` | Actor identity (id, role, workspace) |
| `ProofTrustTarget` | Action target (type, id) |
| `ProofTrustActionInput` | Input for evaluating an action |
| `ProofTrustReceiptInput` | Input for creating a receipt |
| `ProofTrustEvaluationResult` | Evaluation output (decision, risk, confirmation) |
| `ProofTrustApprovalRequest` | Input for requesting approval |
| `ProofTrustTrustStatus` | System status output |
| `ProofTrustReceiptType` | 15 generic receipt types |
| `ProofTrustRiskLevel` | low / medium / high / blocked |
| `ProofTrustDecision` | allow / deny / requiresConfirmation / requiresAdminApproval |

### API Routes

#### `GET /api/kai/prooftrust/status`
- **Access:** super-admin only
- **Returns:** bridge mode, engine status, supported apps/types/levels, version, note

#### `POST /api/kai/prooftrust/evaluate`
- **Access:** super-admin only
- **Body:** `{ appId, actionType, actorRole, riskLevel, targetType?, targetId?, metadata? }`
- **Returns:** `{ decision, riskLevel, requiresConfirmation, requiresAdminApproval, reason, bridgeMode }`
