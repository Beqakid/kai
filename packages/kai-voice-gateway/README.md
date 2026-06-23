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
