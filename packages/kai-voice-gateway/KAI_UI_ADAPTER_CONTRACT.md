# Kai UI Adapter Contract

**Phase 11 Phase 3 — Cross-App UI Adapter**

## Purpose

The Kai UI Adapter Contract defines how any frontend app (Carehia, Viliniu, Volau, Jon Command Center, Kai) can safely communicate with Kai Navigation Core and the Support Request Layer.

The adapter receives a structured request from a frontend app and returns a **recommendation-only response** with UI commands. It never executes external app changes, never sends emails, never processes payments, and never bypasses Permission Gate or Action Receipts.

---

## Request Shape

```typescript
interface KaiUiAdapterRequest {
  appId: string;                    // Required: carehia | viliniu | volau | jon-command-center | kai
  userRole: string;                 // Required: validated against known roles
  currentScreen?: string;           // Optional: current screen path
  currentRouteKey?: string;         // Optional: current route key
  message?: string;                 // Optional: natural-language user message
  intentType?: KaiUiIntentType;     // Optional: explicit intent type
  routeKey?: string;                // Optional: explicit target route
  actionKey?: string;               // Optional: explicit target action
  supportRequestType?: string;      // Optional: support request type
  metadata?: Record<string, unknown>; // Optional: extra context (sanitized)
  clientRequestId?: string;         // Optional: client-side tracking ID
}
```

## Response Shape

```typescript
interface KaiUiAdapterResponse {
  appId: KaiUiAdapterAppId;
  decision: KaiUiDecision;          // allowed | recommended | requires_confirmation | requires_admin_review | blocked | unsupported | not_found | failed
  riskLevel: KaiUiRiskLevel;       // low | medium | high | blocked
  message: string;                  // Human-readable message
  commands: KaiUiCommand[];         // Frontend-safe UI commands
  routeKey?: string;                // Resolved route key
  actionKey?: string;               // Resolved action key
  supportRequestSuggestion?: KaiUiSupportRequestSuggestion;
  confirmation?: KaiUiConfirmation;
  adminReview?: KaiUiAdminReview;
  receiptSummary?: KaiUiReceiptSummary;
  errors?: string[];
  clientRequestId?: string;
}
```

## Command Types

| Command | Purpose | Safety |
|---------|---------|--------|
| `show_message` | Display a message to the user | Display-only |
| `navigate_to_route` | Recommend navigation to a route | Recommendation-only |
| `open_modal` | Recommend opening a modal | Recommendation-only |
| `open_support_form` | Pre-fill and show support form | No auto-creation |
| `request_confirmation` | Require user confirmation | Blocks until confirmed |
| `request_admin_review` | Require admin approval | Blocks until reviewed |
| `show_blocked_notice` | Show blocked action notice | No executable action |
| `show_unsupported_notice` | Show unsupported notice | No executable action |
| `show_receipt` | Show receipt record | Display-only |
| `no_op` | No action needed | Safe |

## App IDs and Role Rules

**Supported Apps:** carehia, viliniu, volau, jon-command-center, kai

**Supported Roles:** caregiver, client, agency-admin, vendor, customer, driver, public-user, contributor, reviewer, admin, super-admin, viewer

**Rules:**
- JWT token identity is always authoritative.
- Body `userRole` cannot escalate permissions beyond the JWT role.
- Body `userId` is ignored — the token's `sub` claim is used.
- `super-admin` can evaluate any app context.
- Regular users can only evaluate their own app context.

## Metadata Sanitization

The following fields are **stripped entirely** from metadata before processing:

- `Authorization`, `token`, `accessToken`, `refreshToken`
- `password`, `secret`, `apiKey`
- `rawPhoto`, `photoDataUrl`, `base64`, `file`
- `rawPrivateData`, `paymentCard`, `bankAccount`, `mpaisaDetails`
- `ssn`, `governmentId`, `backgroundCheckRawData`, `medicalRecordRawData`

Values over 500 characters are truncated.

## Route/Action Evaluation Flow

1. Validate `appId` and `userRole` against known values.
2. If `routeKey` is provided → evaluate via Navigation Core registry.
3. If `actionKey` is provided → evaluate via Navigation Core action registry.
4. If `supportRequestType` is provided → create support suggestion (no auto-creation).
5. If `message` is provided → infer intent via deterministic keyword matching.
6. Build response with appropriate commands and risk decisions.
7. Create Action Receipt.

## Support Request Suggestion Flow

When a support request type is specified or inferred from a message:
- A **suggestion** is created with pre-filled title, description, urgency, and next steps.
- The frontend receives an `open_support_form` command with the draft.
- The request is **NOT automatically created** — the user must review and submit.
- Exception: If the endpoint is explicitly `POST /api/kai/support/requests`, the existing Support Layer handles creation.

## Confirmation / Admin-Review Handling

| Risk Level | Decision | Command |
|------------|----------|---------|
| `low` | `allowed` | `navigate_to_route` or `show_message` |
| `medium` | `requires_confirmation` | `request_confirmation` + route info |
| `high` | `requires_admin_review` | `request_admin_review` |
| `blocked` | `blocked` | `show_blocked_notice` |

## Blocked Action Handling

Blocked actions return:
- Decision: `blocked`
- Risk level: `blocked`
- Command: `show_blocked_notice` with the block reason
- **No executable commands are included**

## What External Apps Should Do With Commands

1. Read the `commands` array from the response.
2. For `navigate_to_route`: Use the `routePath` to navigate the user within the app.
3. For `open_support_form`: Open a support form pre-filled with the suggestion draft.
4. For `request_confirmation`: Show a confirmation dialog. On confirm, proceed with the action.
5. For `request_admin_review`: Show an admin-review notice. Queue the request for admin approval.
6. For `show_blocked_notice`: Show the blocked reason. Do not proceed.
7. For `show_receipt`: Display the receipt as an audit record.

## What External Apps Must NOT Do Automatically

- ❌ Execute navigation without user awareness
- ❌ Create support requests without user review
- ❌ Process payments or payouts
- ❌ Approve vendors, caregivers, or identity documents
- ❌ Send emails or messages
- ❌ Generate invoices or quotes
- ❌ Change permissions or grant admin access
- ❌ Bypass confirmation requirements

---

## Example Integrations

### Carehia — Caregiver CPR Upload

**Request:**
```json
{
  "appId": "carehia",
  "userRole": "caregiver",
  "message": "Where do I upload my CPR certificate?"
}
```

**Response:**
```json
{
  "appId": "carehia",
  "decision": "requires_admin_review",
  "riskLevel": "high",
  "message": "I can guide you to \"Certifications\", but this is a sensitive area that requires admin approval.",
  "commands": [{ "type": "request_admin_review", ... }],
  "routeKey": "certifications",
  "adminReview": { "required": true, "reviewType": "navigation_access", ... }
}
```

### Viliniu — Vendor Payout Change

**Request:**
```json
{
  "appId": "viliniu",
  "userRole": "vendor",
  "message": "I need to change my payout details"
}
```

**Response:**
```json
{
  "appId": "viliniu",
  "decision": "requires_admin_review",
  "riskLevel": "high",
  "message": "I can guide you to \"Vendor Payouts\", but this is a sensitive area that requires admin approval.",
  "commands": [{ "type": "request_admin_review", ... }],
  "routeKey": "vendor_payouts",
  "adminReview": { "required": true, ... }
}
```

### Volau — Report Wrong Plant Info

**Request:**
```json
{
  "appId": "volau",
  "userRole": "public-user",
  "message": "This plant information is wrong"
}
```

**Response:**
```json
{
  "appId": "volau",
  "decision": "recommended",
  "riskLevel": "low",
  "message": "A support request suggestion has been prepared.",
  "commands": [{ "type": "open_support_form", ... }],
  "supportRequestSuggestion": {
    "requestType": "report_content_issue",
    "title": "report content issue request",
    ...
  }
}
```

### JCC — Super-Admin Carehia Blockers

**Request:**
```json
{
  "appId": "jon-command-center",
  "userRole": "super-admin",
  "message": "Show me Carehia blockers"
}
```

**Response:**
```json
{
  "appId": "jon-command-center",
  "decision": "allowed",
  "riskLevel": "low",
  "message": "You can navigate to \"Carehia Module\" at /modules/carehia.",
  "commands": [{ "type": "navigate_to_route", "routeKey": "carehia_module", "routePath": "/modules/carehia" }],
  "routeKey": "carehia_module"
}
```

---

## Future: Phase 4 Frontend Integration Plan

Phase 4 will:
1. Create lightweight SDK packages for each app (Carehia, Viliniu, Volau, JCC).
2. Add React hooks (`useKaiAdapter`) for calling the `POST /api/kai/ui-adapter/evaluate` endpoint.
3. Add UI components for rendering Kai commands (confirmation dialogs, admin-review banners, support form pre-fills).
4. Implement real-time Kai state via WebSocket or polling.
5. Add LLM-powered intent inference (replacing deterministic keyword matching).
6. All frontend integration will respect the same safety constraints — commands remain recommendations only.

## Frontend SDK

**Package:** `packages/kai-ui-sdk` (`@kai/ui-sdk`)

**Purpose:** Reusable TypeScript/React SDK that lets any app in the ecosystem communicate with the Kai UI Adapter endpoint safely. Provides typed API client, command dispatch helpers, React hooks, support helpers, and security-enforced error handling.

**Relationship to this endpoint:** The SDK is the canonical frontend client for `POST /api/kai/ui-adapter/evaluate`. It sanitizes metadata, manages auth tokens securely (never stored), and dispatches UI commands to host-app-provided handlers — never auto-executing navigation, support requests, or sensitive actions.

**Future integration phases:** Phase 5+ will add UI components for rendering Kai commands, real-time state updates, and LLM-powered intent inference. The SDK's handler-based architecture is designed to support these additions without breaking existing integrations.
