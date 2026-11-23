# Capital & Giving Ledger deployment

The same-origin `POST /api/fm/investment-donations` route handles writes.
It does not use the Next.js Server Action transport. Directus still supplies
the journal, registers, periods, and module access data through `/items`.
No Directus extension is needed.

Set `CGL_MYSQL_URL` in the Next.js server environment to a MySQL connection URL
for the **same schema** used by Directus. Use a dedicated account with access
only to the ledger tables. It needs SELECT on those tables, INSERT on journal
headers, lines, audit events and reconciliation records/events, and UPDATE on
journal headers and reconciliation records. MySQL locking reads also require a
write privilege on the locked register and period tables; scope those grants
to those tables. Do not grant DELETE or DDL privileges.

For reconciliation, configure `CGL_RECON_PREPARER_IDS` and
`CGL_RECON_APPROVER_IDS` as comma-separated VOS IDs. Users also need access to
the Monthly reconciliation workspace. Use two distinct users for live testing.
Apply `reconciliation.mysql.sql` only if the tables are not already provisioned.
Restart Next.js after setting the environment variables.

On dummy data, save a draft in a completed, open month without a historical
sign-off, verify that its preparer cannot sign it, then sign in as the second
user and approve. Check the saved revision and before/after audit events.

For period commands, apply `period-events.mysql.sql` and grant the application
account SELECT and INSERT on `cgl_period_events` and INSERT and UPDATE on
`cgl_periods`. The period workspace requires its existing workspace access plus
the approver allowlist. Test a stale reconciliation, an outstanding loan
accrual, and a year-end close/reopen on disposable data before rollout.
Imported historical closes are intentionally not reopenable.

Trades, giving, loans, and capital stock require UPDATE on `cgl_registers`
for `lots`, `grants`, `debts`, `subs`, `certs`, `transfers`, and `dividends`.
Register updates share the journal or audit transaction. Transfers operate on
one surrendered certificate at a time. Historical imported transfers are not
voidable through the new workflow. Donor-tax reversals for taxable gifts
require a same-calendar-year posting date. Form 1707/1707-A and donation
references are append-only audit events; a reference does not upload a file
or submit a return. CSV reports are supporting workpapers, not certified
SEC or BIR filing files.

For annual reviews, apply `annual-review.mysql.sql` and grant SELECT and INSERT
on `cgl_annual_review_events`. Do not grant UPDATE or DELETE on that history.
In the Annual review workspace, save a checklist as a preparer, sign it with
a different approver, then reopen it with a reason and confirm all revisions
remain in the history.

Optional per-workspace permissions: set `CGL_WORKSPACE_ROLES` to server-only
JSON keyed by VOS user ID, then workspace key. For example:
`{"101":{"monthly-reconciliation":"prepare"},"102":{"monthly-reconciliation":"approve","period-close":"approve"}}`.
Values are `none`, `view`, `prepare`, and `approve`. Existing Directus workspace
access is still required. When configured, omitted entries default to `view`
and legacy write allowlists no longer apply. Without this setting, existing
administrator and reconciliation allowlist behavior remains in place.
