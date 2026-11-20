# Directus posting endpoint

Build from the application repository root:

```powershell
node src/modules/financial-management/investment-donations/server/directus-extension/build.mjs
node --test src/modules/financial-management/investment-donations/server/directus-extension/transaction.test.mjs
```

Deploy the generated `dist` folder and `package.json` to the Directus 11 server's
configured extensions directory, under `directus-extension-capital-giving-ledger`.
Reload extensions or restart Directus. The admin service token used by the app
must receive HTTP 200 and `{"ready":true}` from `GET /capital-giving-ledger/health`.
The token is server-only; do not expose it to browser code.

The app derives the acting user from the authenticated VOS session. Only admins
with the corresponding workspace grant can post. Do not grant ordinary users
direct write access to the `cgl_*` tables. The endpoint uses the existing MySQL DDL
and seeded policy row; it commits the header, lines, seal, and audit event together.

After deployment, use the signed-in UI to post a small fee or receipt dated in an
open period, check Transactions and the audit row in Directus, then use a different
administrator to reverse it. The automated tests use a transaction double and do
not replace this live check.
