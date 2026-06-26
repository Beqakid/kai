# @kai/ui-components

Reusable UI components for rendering Kai SDK command responses safely and consistently across Carehia, Viliniu, Volau, Jon Command Center, and future apps.

## Relationship to @kai/ui-sdk

| Package | Purpose |
|---------|---------|
| `@kai/ui-sdk` | API client + command helpers — calls the Kai UI Adapter endpoint |
| `@kai/ui-components` | React components — renders SDK responses as interactive UI |

The SDK handles communication; components handle display.

## Installation

```bash
# Inside the Kai monorepo
npm install
```

Peer dependencies: `react >=17`, `react-dom >=17`

## Components

### Command-to-Component Mapping

| Kai Command Type | Component | Purpose |
|-----------------|-----------|---------|
| `show_message` | `KaiMessageBubble` | Styled message bubble |
| `navigate_to_route` | `KaiNavigationCard` | Route suggestion with opt-in "Open" button |
| `request_confirmation` | `KaiConfirmationDialog` | Modal dialog requiring explicit user click |
| `request_admin_review` | `KaiAdminReviewBanner` | Alert banner with optional support/review buttons |
| `open_support_form` | `KaiSupportPrefillCard` | Prefilled support form card |
| `show_blocked_notice` | `KaiBlockedNotice` | Terminal blocked notice (no execute buttons) |
| `show_unsupported_notice` | `KaiUnsupportedNotice` | Unsupported request notice |
| `show_receipt` | `KaiReceiptCard` | Safe receipt summary display |
| *(composite)* | `KaiCommandResultPanel` | Renders full `KaiUiAdapterResponse` |
| *(composite)* | `KaiAssistantPanel` | Text input + response display panel |
| *(composite)* | `KaiSdkAssistantPanel` | SDK client + assistant panel convenience wrapper |

### Handler Pattern

All components are **display/interaction helpers only**. Host apps must provide handlers:

```tsx
import { KaiCommandResultPanel } from '@kai/ui-components';

<KaiCommandResultPanel
  response={kaiResponse}
  handlers={{
    onNavigate: (cmd) => router.push(cmd.routePath),
    onSupportForm: (suggestion) => openSupportModal(suggestion),
    onConfirmation: (confirmation) => showConfirmDialog(confirmation),
    onAdminReview: (review) => createSupportTicket(review),
  }}
/>
```

- **No handler = no action.** Components render in a safe disabled/informational state.
- **Blocked commands are terminal.** `KaiCommandResultPanel` stops rendering after a blocked notice.
- **No auto-execution.** Every action requires an explicit user click.

### Theme Override

```tsx
import { KaiCommandResultPanel } from '@kai/ui-components';

<KaiCommandResultPanel
  response={response}
  handlers={handlers}
  theme={{
    primaryColor: '#your-brand-color',
    accentColor: '#your-accent',
    surfaceColor: '#f8f9fa',
    borderRadius: '8px',
    compact: true,
  }}
/>
```

Available theme tokens: `primaryColor`, `accentColor`, `surfaceColor`, `textColor`, `mutedTextColor`, `borderColor`, `borderRadius`, `dangerColor`, `warningColor`, `successColor`, `blockedColor`, `fontFamily`, `compact`.

Built-in modes: `LIGHT_TOKENS`, `DARK_TOKENS`. Use `resolveTheme(overrides, mode)`.

## Utility Helpers

### Format Utilities

```ts
import {
  formatRiskLabel,
  formatDecisionLabel,
  formatCommandLabel,
  getRiskTone,
  getDefaultCommandMessage,
  getSafeDisplayText,
} from '@kai/ui-components';

formatRiskLabel('high');      // "High risk"
formatDecisionLabel('blocked'); // "Blocked"
getRiskTone('blocked');       // "blocked"
getSafeDisplayText('<script>xss</script>'); // "" (stripped)
```

### Command Group Utilities

```ts
import {
  groupCommandsByType,
  getPrimaryCommand,
  hasBlockingCommand,
  hasConfirmationCommand,
  hasAdminReviewCommand,
  hasSupportCommand,
  hasNavigationCommand,
} from '@kai/ui-components';

const primary = getPrimaryCommand(response.commands);
const isBlocked = hasBlockingCommand(response.commands);
```

## Safety Rules

- ✅ Components are display/interaction helpers only
- ✅ Host app provides all actual handlers
- ✅ No auto-navigation (`window.location` never called)
- ✅ No auto-support-request creation
- ✅ No auto-confirmation on render
- ✅ No auto-admin-approval
- ✅ Blocked commands are terminal (no execute buttons)
- ✅ No raw metadata displayed
- ✅ No tokens/secrets/passwords displayed
- ✅ No bank/card/government/medical data in support prefill
- ✅ No emails sent
- ✅ No payments processed
- ✅ No external app data modified
- ✅ Permission Gate / Pending Confirmation / Action Receipts preserved

## Accessibility

- Semantic HTML (`role="dialog"`, `role="alert"`, `role="status"`, `role="region"`)
- Keyboard navigation supported
- `aria-label` on interactive elements
- Readable text contrast
- Risk communicated via text labels (not color-only)
- Disabled buttons explain why (`"Navigation not available"`)
- Dialog supports `aria-modal`

## App Examples

### Carehia (Caregiver CPR Upload)

```tsx
import { KaiAssistantPanel } from '@kai/ui-components';
import { createKaiClient } from '@kai/ui-sdk';

const client = createKaiClient({ baseUrl: API_URL, appId: 'carehia', getAuthToken });

<KaiAssistantPanel
  appId="carehia"
  role="caregiver"
  currentScreen="certifications"
  onSubmitIntent={async (msg) => {
    const res = await client.evaluateIntent({ message: msg, role: 'caregiver' });
    setResponse(res);
  }}
  response={response}
  handlers={{
    onNavigate: (cmd) => router.push(cmd.routePath ?? '/certifications'),
    onSupportForm: (s) => openSupportForm(s),
  }}
/>
```

### Viliniu (Vendor Payout Change)

```tsx
// Vendor asks to change payout details
// → KaiAdminReviewBanner renders "Admin review required"
// → KaiSupportPrefillCard opens support form
// → No payout modification happens

<KaiCommandResultPanel
  response={payoutResponse}
  handlers={{
    onAdminReview: (review) => openSupportTicket(review),
    onSupportForm: (s) => openSupportForm(s),
  }}
/>
```

### Volau (Plant Info Correction)

```tsx
// User reports wrong plant info
// → KaiSupportPrefillCard opens correction/support form
// → No auto-publish happens

<KaiCommandResultPanel
  response={correctionResponse}
  handlers={{
    onSupportForm: (suggestion) => openCorrectionForm(suggestion),
  }}
/>
```

### Jon Command Center (Cross-App Blockers)

```tsx
// Super-admin asks for Carehia blockers
// → KaiNavigationCard routes to Carehia module when clicked

<KaiCommandResultPanel
  response={blockerResponse}
  handlers={{
    onNavigate: (cmd) => navigateToModule(cmd.routeKey, cmd.routePath),
  }}
/>
```

## Tests

46 tests covering:
- **Component rendering** (1–20): Each component renders correctly, handlers fire only on click
- **Utilities** (21–30): Format helpers, command grouping, type checks
- **Security** (31–41): No raw metadata, no tokens, no auto-confirm, no payments, no emails
- **Build** (42–46): TypeScript compiles, exports valid, theme merging works

```bash
cd packages/kai-ui-components && npx vitest run
```
