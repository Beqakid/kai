# Kai Navigation Core + Support Request Layer — Phase 11

## Overview

Phase 11 adds two reusable cross-app modules to the Kai Voice Gateway:

1. **Kai Navigation Core** — understands which app the user is in, their role, and the current screen; recommends safe navigation; evaluates route/action risk; and blocks unsafe access.

2. **Kai Support Request Layer** — creates, stores, and triages support requests from users across all apps, with risk-based routing and admin review requirements.

Both modules are **reusable across all supported apps** and are not hardcoded to any single app.

---

## Supported Apps

| App ID | Description |
|---|---|
| `carehia` | Care platform (scheduling, clients, trust passport) |
| `viliniu` | Marketplace (orders, products, vendors, payouts) |
| `volau` | Knowledge/nature platform (species, weather, provinces) |
| `jon-command-center` | Founder command center (projects, Kai tasks, modules) |
| `kai` | Kai internal (tasks, receipts, pending actions, registry) |

---

## Kai Navigation Core

### What It Does

The Navigation Core provides a route and action registry for each app, enabling Kai to:

- **Look up routes** a user can access based on their app and role
- **Look up actions** available to the user
- **Evaluate navigation requests** and return risk-aware decisions
- **Create navigation receipts** for audit logging
- **Sanitize metadata** to prevent sensitive data leakage

### Route Types

| Type | Description |
|---|---|
| `screen` | Standard app screen |
| `modal` | Modal dialog |
| `tab` | Tab within a screen |
| `external_link` | Link to external resource |
| `admin_panel` | Admin-only panel |
| `support` | Support/help center |
| `settings` | App settings |
| `proof` | Proof submission/review |
| `payment_sensitive` | Payment-related (high risk) |
| `trust_sensitive` | Identity/verification (high risk) |

### Risk Levels

| Level | Behavior |
|---|---|
| `low` | Auto-recommended, no confirmation needed |
| `medium` | Requires user confirmation before proceeding |
| `high` | Requires admin approval |
| `blocked` | Permanently denied |

### Navigation Decisions

| Decision | Meaning |
|---|---|
| `allowed` | User can navigate freely |
| `requires_confirmation` | User must confirm before proceeding |
| `requires_admin_approval` | Admin must approve |
| `blocked` | Access denied |
| `unsupported` | No valid target specified |
| `not_found` | Route/action not in registry |

### Role-Aware Navigation

Routes are filtered by the user's role. For example:

- **Vendor** in Carehia sees: Today, Work, Schedule, Clients, Time Tracker, Trust Passport, Profile, Support
- **Vendor** in Carehia does NOT see: Invoices, Verification Queue, Incident Queue
- **Customer** in Viliniu sees: Today, Orders, Support
- **Customer** in Viliniu does NOT see: Products, Vendor Profile, Payouts, Admin panels

### Examples

**Carehia — Caregiver asks where to upload CPR certification:**
```
Input:  { appId: "carehia", targetRouteKey: "trust_passport" }
Output: {
  decision: "requires_admin_approval",
  riskLevel: "high",
  message: "I can guide you to Trust Passport, but this is a sensitive area
            that requires admin approval.",
  routePath: "/trust-passport"
}
```

**Viliniu — Vendor asks to update payout details:**
```
Input:  { appId: "viliniu", targetRouteKey: "payouts" }
Output: {
  decision: "requires_admin_approval",
  riskLevel: "high",
  message: "I can guide you there, but payout changes are sensitive."
}
```

**Volau — User reports wrong plant knowledge:**
```
Input:  { appId: "volau", targetRouteKey: "submit_knowledge" }
Output: {
  decision: "allowed",
  riskLevel: "low",
  message: "You can navigate to Submit Knowledge at /knowledge/submit."
}
```

**JCC — Super-admin asks to open Carehia blockers:**
```
Input:  { appId: "jon-command-center", targetRouteKey: "carehia_module" }
Output: {
  decision: "allowed",
  riskLevel: "low",
  message: "You can navigate to Carehia Module at /modules/carehia."
}
```

---

## Kai Support Request Layer

### What It Does

The Support Request Layer allows users across all apps to:

- **Create support requests** (help, bugs, feature requests, billing questions, etc.)
- **Track request status** through a defined lifecycle
- **Route requests** based on risk and type (auto-triage vs. admin review)
- **Generate receipts** for all request events

### Request Types

| Type | Admin Review Required | Risk Level |
|---|---|---|
| `help` | No | Low |
| `bug` | No | Low |
| `feature_request` | Yes | Medium |
| `custom_change` | Yes | Medium |
| `billing_question` | Yes | Medium |
| `verification_help` | Yes | Medium |
| `dispute_help` | Yes | Medium |
| `trust_safety` | Yes | Medium-High |
| `admin_review` | Yes | Medium |
| `technical_support` | No | Low |
| `other` | No | Low |

### Support Request Lifecycle

```
new → triaged → waiting_for_user / waiting_for_admin → estimated → approved → in_progress → resolved / closed
                                                                                            ↗
                                                                             rejected ──────
```

### What Requires Admin Review

- Custom change requests
- Feature requests
- Billing questions
- Dispute help
- Verification help
- Trust & safety concerns
- Explicit admin review requests

### Access Control

| Role | Can Create | Can List | Can Update Status |
|---|---|---|---|
| `viewer` | Yes (own) | Own only | No |
| `customer` | Yes (own) | Own only | No |
| `vendor` | Yes (own) | Own only | No |
| `admin` | Yes | App-scoped | Yes |
| `super-admin` | Yes | All apps | Yes |

### What Is NOT Done in Phase 1

- ❌ No emails are sent
- ❌ No pricing quotes are generated automatically
- ❌ No work is approved automatically
- ❌ No developers are assigned automatically
- ❌ No invoices or quotes are created
- ❌ No payments are processed
- ❌ No permissions are granted
- ❌ No external apps are modified

---

## How Receipts Work

Phase 11 adds 6 new receipt types:

| Receipt Type | When Created |
|---|---|
| `kai_navigation_requested` | Navigation evaluation is requested |
| `kai_navigation_recommended` | Navigation recommendation is made |
| `kai_navigation_blocked` | Navigation is blocked |
| `kai_support_request_created` | Support request is created |
| `kai_support_request_status_changed` | Support request status is updated |
| `kai_support_request_escalated` | Support request is escalated |

All receipts include: `appId`, `actorId`, `actorRole`, `routeKey`/`actionKey` (if applicable), `riskLevel`, `decision`, `supportRequestId` (if applicable), sanitized metadata only (no tokens, secrets, PII).

---

## Why External App Modification Is Not Enabled Yet

Phase 11 is the **shared foundation** — types, services, registries, and tests. External app modification requires:

1. **Read-only production bridge** (Phase 12) — Kai observes real app state
2. **Controlled write access** (Phase 13) — admin-approved writes through Permission Gate
3. **Full ProofTrust Engine** (Phase 14) — trust scoring and audit trails
4. **Production deployment** (Phase 15) — live Kai assistant in apps

Phase 11 ensures the route registry, action registry, support request system, and receipt logging are battle-tested before any live integration.

---

## Future Integration Path

### Carehia
- Kai recommends navigation within Carehia based on role and context
- Support requests for scheduling issues, client questions, verification help
- Trust Passport navigation is high-risk and admin-gated

### Viliniu
- Kai guides vendors through order management, product updates
- Payout-related navigation requires admin approval
- Dispute help creates admin-review support requests

### Volau
- Kai helps with species lookup, weather, and emergency help
- Knowledge submissions are low-risk and auto-allowed
- Reviewer queue access is medium-risk for admins

### Jon Command Center
- Super-admin sees all modules, receipts, and support queues
- Admin sees project overview, Kai tasks, and pending confirmations
- Support queue routes cross-app requests

---

## API Endpoints

### Navigation Routes

| Method | Path | Description | Auth |
|---|---|---|---|
| `GET` | `/api/kai/navigation/apps/:appId/routes` | List routes for an app | Required |
| `GET` | `/api/kai/navigation/apps/:appId/actions` | List actions for an app | Required |
| `POST` | `/api/kai/navigation/evaluate` | Evaluate a navigation request | Required |

### Support Routes

| Method | Path | Description | Auth |
|---|---|---|---|
| `POST` | `/api/kai/support/requests` | Create a support request | Required |
| `GET` | `/api/kai/support/requests` | List support requests | Required |
| `GET` | `/api/kai/support/requests/:id` | Get a specific request | Required |
| `POST` | `/api/kai/support/requests/:id/status` | Update request status | Admin+ |

---

## Database Tables

### kai_app_route_registry
Stores route definitions per app with role-based access and risk levels.

### kai_app_action_registry
Stores action definitions per app with role-based access, risk levels, and blocked flag.

### kai_support_requests
Stores support requests with lifecycle tracking, risk classification, and admin review requirements.

---

## Test Coverage

Phase 11 adds **47 new tests** covering:

- Navigation Core validation (tests 1–14)
- Support Request Layer (tests 15–30)
- Router/Security integration (tests 31–36)
- Additional edge cases and coverage

**Total: 314/314 tests passing** (267 previous + 47 new)

TypeScript: ✅ Clean  
Wrangler Build: ✅ Passes
