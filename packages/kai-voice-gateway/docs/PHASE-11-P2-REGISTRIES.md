# Phase 11 Phase 2 — App-Specific Route and Action Registries

## Overview

Phase 2 adds detailed app-specific route and action registries for all 5
supported apps (Carehia, Viliniu, Volau, Jon Command Center, and Kai),
a seed service, validation helpers, new router endpoints, and comprehensive
tests.

## Architecture

```
navigation-core/
├── types.ts                  # Phase 2: Added KaiAppRegistrySummary, new roles
├── navigation-core.ts        # Updated to use Phase 2 registries
├── default-routes.ts         # Phase 1 defaults (preserved, still importable)
├── registry-seed-service.ts  # In-memory seed service with idempotent upsert
├── registry-validation.ts    # Structural validation for route/action entries
└── registries/
    ├── index.ts              # Unified lookup across all app registries
    ├── carehia.registry.ts   # 18 routes, 9 actions
    ├── viliniu.registry.ts   # 20 routes, 11 actions
    ├── volau.registry.ts     # 14 routes, 8 actions
    ├── jcc.registry.ts       # 13 routes, 8 actions
    └── kai.registry.ts       # 10 routes, 7 actions
```

## New Roles (Phase 2)

| Role          | Apps                          |
|---------------|-------------------------------|
| caregiver     | Carehia                       |
| client        | Carehia                       |
| agency-admin  | Carehia                       |
| contributor   | Volau                         |
| reviewer      | Volau                         |
| driver        | Viliniu                       |
| public-user   | Volau                         |

These extend the Phase 1 roles (super-admin, admin, vendor, customer, viewer).

## Safety

All blocked/sensitive actions remain in force:
- No payment processing
- No payout/refund approvals
- No caregiver/vendor identity approvals
- No permission gate bypass
- No code deployment
- No self-modification of Kai code
- No disabling of action receipts or pending confirmation

All high-risk routes require admin approval. All medium-risk routes
require confirmation. All blocked actions return `blocked` decision.

## New Router Endpoints

| Method | Path                                         | Auth      | Description                     |
|--------|----------------------------------------------|-----------|--------------------------------|
| POST   | /api/kai/navigation/registries/seed          | super-admin | Seed all app registries        |
| GET    | /api/kai/navigation/apps/:appId/summary      | any auth   | App registry summary           |

## Tests

52 new tests in `app-registries.test.ts` covering:
- Registry definitions (5 apps)
- Role-based access per app (Carehia 7, Viliniu 7, Volau 6, JCC 5, Kai 4)
- Seed service (6 tests: insert, idempotency, duplicates, force, receipts)
- Security (10 tests: auth, blocked actions, sensitive actions, Permission Gate)

Total test suite: 372 tests passing.
