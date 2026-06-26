# @kai/ui-sdk

Frontend SDK for Kai Navigation Core, Support Request Layer, and Cross-App UI Adapter.

## What This Is

A reusable TypeScript/React SDK that lets Carehia, Viliniu, Volau, Jon Command Center, and future apps safely communicate with the Kai UI Adapter endpoint (`POST /api/kai/ui-adapter/evaluate`).

The SDK:
- Sends app context and user intent to Kai
- Receives safe UI commands (navigation, support, confirmation, etc.)
- Provides typed command handlers for host apps to opt into
- Includes React hooks for state management
- Enforces security boundaries at the SDK level

## What This Is NOT

The SDK does **not**:
- Navigate the browser directly (host app must provide a handler)
- Create support requests automatically (host app decides)
- Process payments, refunds, or billing changes
- Send emails or notifications
- Modify external app data
- Store auth tokens (in memory, localStorage, or anywhere)
- Bypass Permission Gate, Pending Confirmation, or Action Receipts
- Execute blocked actions under any circumstances

## Installation

Inside the monorepo:

```bash
# From the repo root
npm install
```

Import in your app:

```ts
import { createKaiClient, handleKaiCommands } from '@kai/ui-sdk';
```

React hooks (optional — requires React 17+):

```ts
import { useKaiClient, useKaiIntent } from '@kai/ui-sdk';
```

## Quick Start

### 1. Create a Client

```ts
import { createKaiClient } from '@kai/ui-sdk';

const kai = createKaiClient({
  baseUrl: 'https://kai-gateway.example.com',
  appId: 'carehia',
  getAuthToken: async () => getSessionToken(), // Never stored by SDK
  defaultRole: 'caregiver',
  onAuthError: (err) => redirectToLogin(),
  onNetworkError: (err) => showOfflineNotice(),
});
```

### 2. Evaluate an Intent

```ts
const response = await kai.evaluateIntent({
  message: 'Where do I upload my CPR certificate?',
  role: 'caregiver',
});
```

### 3. Evaluate Navigation

```ts
const response = await kai.evaluateNavigation('certifications');
```

### 4. Evaluate an Action

```ts
const response = await kai.evaluateAction('upload_certification');
```

### 5. Handle Commands

Commands are opt-in — the SDK never executes them automatically:

```ts
import { handleKaiCommands } from '@kai/ui-sdk';

handleKaiCommands(response.commands, {
  onNavigate: ({ routePath }) => router.push(routePath),
  onSupportForm: (draft) => openSupportForm(draft),
  onConfirmation: (confirmation) => openConfirmDialog(confirmation),
  onAdminReview: (review) => showAdminReviewNotice(review),
  onBlocked: (cmd) => showBlockedToast(cmd.message),
  onUnsupported: (cmd) => showUnsupportedNotice(cmd.message),
  onMessage: (cmd) => showKaiMessage(cmd.message),
  onReceipt: (cmd) => showReceipt(cmd.receiptId),
});
```

## React Hooks

### useKaiClient

```tsx
import { useKaiClient, useKaiIntent } from '@kai/ui-sdk';

function KaiAssistant() {
  const kai = useKaiClient({
    baseUrl: 'https://kai-gateway.example.com',
    appId: 'carehia',
    getAuthToken: async () => getSessionToken(),
  });

  const { loading, error, lastResponse, evaluateIntent } = useKaiIntent(kai);

  return (
    <button onClick={() => evaluateIntent('Where is my schedule?')}>
      Ask Kai
    </button>
  );
}
```

### useKaiNavigation

```tsx
const { evaluateNavigation, loading } = useKaiNavigation(kai);
await evaluateNavigation('dashboard');
```

### useKaiSupport

```tsx
const { requestHelp, reportIssue } = useKaiSupport(kai);
await requestHelp('I need help with my account');
await reportIssue('This plant information is wrong');
```

### useKaiCommandHandler

```tsx
const { handleCommands, handleResponse } = useKaiCommandHandler({
  onNavigate: ({ routePath }) => router.push(routePath),
  onBlocked: (cmd) => toast.error(cmd.message),
});

// When you get a response:
await handleResponse(response);
```

## App Examples

### Carehia — Caregiver CPR Certificate

```ts
const kai = createKaiClient({
  baseUrl: KAI_URL,
  appId: 'carehia',
  getAuthToken: async () => caregiverSession.token,
  defaultRole: 'caregiver',
});

const response = await kai.evaluateIntent({
  message: 'Where do I upload my CPR certificate?',
});

handleKaiCommands(response.commands, {
  onNavigate: ({ routePath }) => {
    // Kai recommends /trust-passport/certifications
    router.push(routePath);
  },
  onAdminReview: (review) => {
    // If certification upload requires admin review
    showAdminReviewNotice(review);
  },
});
```

### Viliniu — Vendor Payout Change

```ts
const kai = createKaiClient({
  baseUrl: KAI_URL,
  appId: 'viliniu',
  getAuthToken: async () => vendorSession.token,
  defaultRole: 'vendor',
});

const response = await kai.evaluateIntent({
  message: 'I want to change my payout bank details',
});

// Kai returns admin-review and/or support form — NEVER auto-changes payout
handleKaiCommands(response.commands, {
  onAdminReview: (review) => {
    showNotice('Payout changes require admin review');
  },
  onSupportForm: (draft) => {
    openSupportForm(draft);
    // No payout change happens — just a support request form
  },
});
```

### Volau — User Reports Wrong Plant Info

```ts
const kai = createKaiClient({
  baseUrl: KAI_URL,
  appId: 'volau',
  getAuthToken: async () => userSession.token,
  defaultRole: 'public-user',
});

const response = await kai.evaluateIntent({
  message: 'This plant information is wrong',
});

handleKaiCommands(response.commands, {
  onSupportForm: (draft) => {
    // Kai suggests a correction form
    openCorrectionForm({
      title: draft.suggestedTitle,
      description: draft.suggestedDescription,
    });
  },
});
```

### JCC — Super-Admin Checks Carehia Blockers

```ts
const kai = createKaiClient({
  baseUrl: KAI_URL,
  appId: 'jon-command-center',
  getAuthToken: async () => adminSession.token,
  defaultRole: 'super-admin',
});

const response = await kai.evaluateIntent({
  message: 'Show me Carehia launch blockers',
});

handleKaiCommands(response.commands, {
  onNavigate: ({ routePath }) => {
    // Kai routes to Carehia blockers module
    router.push(routePath);
  },
});
```

## Security Boundaries

| Rule | Enforced By |
|------|------------|
| Auth tokens never stored | Client — in-memory only, no localStorage |
| Tokens never logged | Client — sanitized from all debug output |
| Metadata sanitized | Client — strips passwords, bank details, SSN, etc. |
| Commands are opt-in | Command handlers — nothing executes without a handler |
| Blocked = terminal | Command dispatch — blocked never becomes executable |
| No auto-navigation | SDK — requires onNavigate handler from host app |
| No auto-support | SDK — requires onSupportForm handler from host app |
| No payment processing | SDK — no payment APIs exist |
| No email sending | SDK — no email APIs exist |
| No external data modification | SDK — read-only adapter evaluation only |
| Permission Gate preserved | Server-side — SDK cannot bypass |
| Pending Confirmation preserved | Server-side — SDK cannot bypass |
| Action Receipts preserved | Server-side — SDK cannot bypass |

## What Host Apps Must Handle

- **Navigation**: Provide an `onNavigate` handler that calls your router
- **Support forms**: Provide an `onSupportForm` handler that opens your form UI
- **Confirmations**: Provide an `onConfirmation` handler that shows a confirm dialog
- **Admin reviews**: Provide an `onAdminReview` handler that shows a review notice
- **Blocked notices**: Provide an `onBlocked` handler that shows a blocked message

## What Host Apps Must NEVER Auto-Execute

- Do not auto-navigate to high-risk routes without confirmation
- Do not auto-submit support requests without user review
- Do not auto-approve admin reviews
- Do not auto-process payments based on Kai commands
- Do not auto-change payout/bank/billing details based on Kai commands
- Do not bypass blocked commands — they are terminal

## API Reference

### Client Methods

| Method | Description |
|--------|------------|
| `evaluateIntent(input)` | Evaluate a free-form user message |
| `evaluateNavigation(routeKey, metadata?)` | Evaluate navigation to a route |
| `evaluateAction(actionKey, metadata?)` | Evaluate an action |
| `requestHelp(message, metadata?)` | Request help |
| `reportIssue(message, metadata?)` | Report an issue |
| `createSupportSuggestion(input)` | Create a support suggestion |
| `getLastResponse()` | Get last stored response |
| `clearLastResponse()` | Clear stored response |

### Command Types

| Type | Handler | Description |
|------|---------|------------|
| `navigate_to_route` | `onNavigate` | Recommend navigation to a route |
| `open_support_form` | `onSupportForm` | Suggest opening a support form |
| `request_confirmation` | `onConfirmation` | Request user confirmation |
| `request_admin_review` | `onAdminReview` | Request admin review |
| `show_blocked_notice` | `onBlocked` | Show blocked action notice (terminal) |
| `show_unsupported_notice` | `onUnsupported` | Show unsupported notice |
| `show_message` | `onMessage` | Display a Kai message |
| `show_receipt` | `onReceipt` | Show action receipt |
| `open_modal` | `onModal` | Open a modal |
| `no_op` | `onNoOp` | No operation needed |

### Support Helpers

| Function | Description |
|----------|------------|
| `buildSupportDraftFromSuggestion(suggestion)` | Build safe support draft |
| `isAdminReviewRequired(response)` | Check if admin review needed |
| `isConfirmationRequired(response)` | Check if confirmation needed |
| `getSupportRequestType(response)` | Get support request category |
| `getSafeSupportTitle(response)` | Get safe title from suggestion |
| `getSafeSupportDescription(response)` | Get safe description |

## Relationship to Kai Phases

- **Phase 1**: Navigation Core + Support Request Layer (server foundation)
- **Phase 2**: App-Specific Route/Action Registries (server registries)
- **Phase 3**: Cross-App UI Adapter Contract (`POST /api/kai/ui-adapter/evaluate`)
- **Phase 4**: **This SDK** (frontend client for the adapter endpoint)
