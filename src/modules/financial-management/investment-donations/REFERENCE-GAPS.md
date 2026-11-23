# Capital & Giving Ledger: reference gaps

Compared the existing workspaces with the local HTML prototype and PDF sections 4, 6–14. The prototype's browser state is not a production persistence model. Retain the existing sidebar routes and Directus storage.

| Workspace | Working or partially covered | Still required for parity |
| --- | --- | --- |
| Overview | Summary, allocation, latest entries, linked alerts for allocation, giving and inflows | Remaining compliance, reconciliation, close, capital and review alerts |
| Transactions | Filters, entry details and CSV; reversal for supported cash commands with MySQL configured | Dependency-aware reversals, register restoration and tax true-ups |
| Inflows & investing | Capital raised, open income receivables, readiness checks, tranche preview, cash and loan balances | Income totals and collection actions, subscription receipts, deposits, loan posting and payoff scheduling |
| Capital stock | Subscription balances and transfer register | SEC checks, cap table, ownership history and exports, certificate/subscription/transfer/dividend commands |
| Portfolio & rebalancing | Allocation and open lots | Securities/history, gift-or-sell estimates, purchases/sales, lot picking, price updates and fee accruals |
| Charitable giving | Budget, gifts, organizations and grants | Audited vetting/documents, donation and grant posting, lot valuation and donor-tax true-ups |
| Tax compliance | Open tax balances and tax payment command | Due dates, filing/certificates, donor-tax and deduction reports, investment/capital reporting and annual CGT true-up |
| Monthly reconciliation | Stored snapshots | Statement drafts, unit matching, variance explanations, change detection and separate approval |
| Period close | Stored period status and database posting locks | Checklist enforcement, accrual computation, ordered close and audited reopen with year-end reversal |
| Annual review | Evidence summary | Persist checklist, sign-off and reopening by financial year |
| Policy & targets | Stored policy display and journal export | Audited changes and lock rules, controlled backup/restore, activity history and remaining exports |

Before expanding write access, add the PDF's per-workspace Prepare/Approve grants and transaction tests; keep the existing database period lock and immutable postings. The present JSON register storage does not yet satisfy the PDF's per-entity relational schema. Validate live posting and approval through Next.js against MySQL with separate preparer and approver accounts. Section 14 is the acceptance checklist; fixture checks alone do not validate live workflows.
