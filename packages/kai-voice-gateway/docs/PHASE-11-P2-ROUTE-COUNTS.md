# Phase 11 Phase 2 — Route and Action Counts

## Per-App Registry Summary

| App                  | Routes | Actions | Blocked Actions | High-Risk Routes | Roles                                              |
|----------------------|--------|---------|-----------------|------------------|----------------------------------------------------|
| Carehia              | 18     | 9       | 4               | 3                | caregiver, client, agency-admin, admin, super-admin |
| Viliniu              | 20     | 11      | 4               | 3                | customer, vendor, driver, admin, super-admin        |
| Volau                | 14     | 8       | 3               | 2                | public-user, contributor, reviewer, admin, super-admin |
| Jon Command Center   | 13     | 8       | 4               | 2                | viewer, admin, super-admin                          |
| Kai                  | 10     | 7       | 4               | 2                | viewer, admin, super-admin                          |
| **Total**            | **75** | **43**  | **19**          | **12**           | 12 unique roles                                     |

## Blocked Actions (all apps combined)

| App       | Action Key                          | Reason                    |
|-----------|-------------------------------------|---------------------------|
| Carehia   | process_payment                     | No payment via Kai        |
| Carehia   | approve_background_check            | Manual review required    |
| Carehia   | approve_caregiver_identity          | Manual review required    |
| Carehia   | grant_admin_access                  | Security-critical         |
| Viliniu   | process_payout                      | No payout via Kai         |
| Viliniu   | issue_refund_automatically          | Manual review required    |
| Viliniu   | change_bank_details                 | Security-critical         |
| Viliniu   | approve_vendor_automatically        | Manual review required    |
| Volau     | auto_approve_traditional_knowledge  | Cultural review required  |
| Volau     | modify_production_database          | No DB access via Kai      |
| Volau     | delete_user                         | Manual review required    |
| JCC       | deploy_code                         | No deployment via Kai     |
| JCC       | modify_production_database          | No DB access via Kai      |
| JCC       | bypass_permission_gate              | Security-critical         |
| JCC       | delete_project                      | Manual review required    |
| Kai       | self_modify_code                    | Self-modification blocked |
| Kai       | disable_permission_gate             | Security-critical         |
| Kai       | disable_pending_confirmation        | Security-critical         |
| Kai       | disable_action_receipts             | Security-critical         |
