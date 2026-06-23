# 🔒 Kai Voice Gateway — Security Retest Checklist

> Phase 9: Comprehensive security retest covering all Kai subsystems.
> 100 tests across 8 security test files.

## Checklist

### 1. Auth Security (`auth-security.test.ts` — 14 tests)
- [x] Missing token → 401
- [x] Malformed JWT → 401
- [x] Expired JWT → 401
- [x] Invalid JWT signature → 401
- [x] Missing required claims → 401
- [x] Invalid appId → 401
- [x] Invalid userRole → 401
- [x] Demo-token rejected in production
- [x] Demo-token accepted only when explicitly enabled
- [x] Request body cannot override token userId
- [x] Request body cannot override token appId (→ 403)
- [x] Request body cannot override token userRole (→ 403)
- [x] Missing KAI_AUTH_SECRET fails safely (→ 500)
- [x] Valid JWT succeeds with correct claims

### 2. Permission Gate Security (`permission-gate-security.test.ts` — 12 tests)
- [x] Blocked action always denied (deploy_code)
- [x] High-risk action denied in v1
- [x] Medium-risk action requires confirmation
- [x] Low-risk action allowed without confirmation
- [x] Unknown action denied by default
- [x] Client allowedActions cannot expand permissions
- [x] Role cannot self-escalate
- [x] Customer/viewer cannot execute admin actions
- [x] Vendor cannot execute super-admin actions
- [x] Gate decision produces correct receipt metadata
- [x] ProofTrust Bridge cannot loosen gate decision
- [x] ProofTrust Bridge can tighten gate decision only

### 3. Pending Confirmation Security (`pending-confirmation-security.test.ts` — 14 tests)
- [x] Medium-risk action creates pending action
- [x] Pending action does not execute before confirmation
- [x] Confirm route requires valid auth context
- [x] Deny route requires valid auth context
- [x] Different user cannot confirm another's pending action
- [x] Different user cannot deny another's pending action
- [x] Super-admin can confirm any pending action
- [x] Expired pending action cannot be confirmed
- [x] Already-executed action cannot execute again
- [x] Already-denied action cannot be confirmed
- [x] Status transition from pending → confirmed enforced
- [x] Status transition from denied → confirmed blocked
- [x] High-risk action cannot become pending
- [x] Blocked action cannot become pending

### 4. Action Receipts Security (`action-receipts-security.test.ts` — 14 tests)
- [x] Recommendation creates receipt
- [x] Blocked action creates receipt
- [x] Prepared action creates receipt
- [x] Confirmed action creates receipt
- [x] Denied action creates receipt
- [x] Expired action creates receipt
- [x] Executed action creates receipt
- [x] Receipt route requires ADMIN_ROLES
- [x] Receipt route requires super-admin
- [x] Metadata sanitizes token/secret fields
- [x] Metadata sanitizes raw token fields (accessToken, refreshToken)
- [x] Metadata sanitizes raw audio data
- [x] Metadata sanitizes private documents (SSN, credit card, bank)
- [x] Receipt logger fails safely if D1 unavailable

### 5. ProofTrust Bridge Security (`prooftrust-bridge-security.test.ts` — 13 tests)
- [x] Status route requires super-admin
- [x] Evaluate route requires super-admin
- [x] Bridge does not execute actions (evaluate only)
- [x] Bridge does not override Permission Gate
- [x] Bridge metadata is sanitized
- [x] Bridge uses existing ActionReceiptLogger
- [x] Blocked actions → blocked receipt with deny decision
- [x] Confirmation actions → requiresConfirmation decision
- [x] No Carehia-specific hardcoded rules in bridge source
- [x] No Viliniu-specific hardcoded rules in bridge source
- [x] No Volau-specific hardcoded rules in bridge source
- [x] Bridge mode returns 'lite'
- [x] Engine connected returns false

### 6. Voice Gateway Security (`voice-gateway-security.test.ts` — 12 tests)
- [x] Oversized audio rejected (413)
- [x] Empty audio rejected (400)
- [x] Missing audio rejected (400)
- [x] Oversized JSON body rejected (413)
- [x] Invalid JSON rejected
- [x] Raw audio not stored by default
- [x] No background listening route exists
- [x] No streaming/always-on route exists
- [x] Voice respond route uses authenticated identity
- [x] Transcribe route uses authenticated identity
- [x] History route requires admin/super-admin
- [x] Rate limit returns 429 when exceeded

### 7. Orchestrator Security (`orchestrator-security.test.ts` — 11 tests)
- [x] doNext cannot bypass gate (blocked actions)
- [x] executeAction cannot bypass gate (blocked actions)
- [x] helpMeOut does not execute actions directly
- [x] generate_tasklet_prompt is low-risk
- [x] summarize_blockers is low-risk
- [x] draft_github_issue is medium-risk + pending
- [x] draft_user_message is medium-risk + pending
- [x] Medium-risk task context elevates action risk
- [x] Blocked suggested action is denied
- [x] High-risk suggested action is denied
- [x] Viewer cannot change task status

### 8. Carehia Seed Pack Security (`carehia-seed-security.test.ts` — 10 tests)
- [x] Seed JSON validates (structure check)
- [x] All tasks have required fields
- [x] All appIds are in VALID_APP_IDS
- [x] All risk levels are valid
- [x] No duplicate task titles
- [x] Medium-risk audit task requires confirmation
- [x] Seed script skips duplicates (NOT EXISTS guard)
- [x] Seed script does not modify Carehia production
- [x] Seed script does not reference external app repositories
- [x] Seeded tasks are planning-only actions

---

## Summary

| Test File | Tests | Status |
|-----------|-------|--------|
| auth-security.test.ts | 14 | ✅ Pass |
| permission-gate-security.test.ts | 12 | ✅ Pass |
| pending-confirmation-security.test.ts | 14 | ✅ Pass |
| action-receipts-security.test.ts | 14 | ✅ Pass |
| prooftrust-bridge-security.test.ts | 13 | ✅ Pass |
| voice-gateway-security.test.ts | 12 | ✅ Pass |
| orchestrator-security.test.ts | 11 | ✅ Pass |
| carehia-seed-security.test.ts | 10 | ✅ Pass |
| **Total** | **100** | **✅ All Pass** |
