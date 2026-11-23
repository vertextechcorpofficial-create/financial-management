import { NextResponse } from "next/server";

import { listDepositSlips, listUndepositedAssets, ValidationError } from "@/modules/financial-management/treasury/bank-management-v2/bank-deposit/services/deposit.service";
import { DirectusError, directusReason, listItems } from "@/modules/financial-management/treasury/bank-management-v2/bank-deposit/services/directus";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [assets, slips, accounts, activeAccounts] = await Promise.all([
      listUndepositedAssets(),
      listDepositSlips(),
      listItems<{
        bank_id: number;
        bank_name: string | null;
        account_number: string | null;
        account_name: string | null;
      }>("bank_accounts", {
        fields: ["bank_id", "bank_name", "account_number", "account_name"],
        // A deposit may only go to an account that is live and has somewhere to post: without a linked
        // GL the entry would fall back to the dummy cash-in-bank account.
        filter: {
          is_active: { _eq: true },
          account_status: { _eq: "ACTIVE" },
          gl_coa_id: { _nnull: true },
        },
        limit: 500,
      }),
      listItems<{ bank_id: number }>("bank_accounts", {
        fields: ["bank_id"],
        filter: { is_active: { _eq: true }, account_status: { _eq: "ACTIVE" } },
        limit: 1,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        assets,
        slips,
        accounts: accounts.rows.map((row) => ({
          bankId: Number(row.bank_id),
          // QA3: the account number is the label, the bank name is the line under it.
          accountNumber: row.account_number?.trim() || null,
          bankName: row.bank_name?.trim() || null,
          label: row.account_number?.trim() || row.bank_name?.trim() || `Account ${row.bank_id}`,
          description: row.bank_name?.trim() || null,
        })),
        // The picker shows only accounts that can post; these two counts let the dialog say why the
        // rest are missing instead of looking like a bug.
        accountTotals: { eligible: accounts.rows.length, active: activeAccounts.total },
      },
    });
  } catch (error) {
    console.error("[bank-management-v2] deposit assets failed", error);
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof DirectusError) {
      const reason = directusReason(error.body);
      return NextResponse.json(
        { success: false, error: reason ? `The database rejected this read: ${reason}` : "Could not read depositable collections." },
        { status: 502 },
      );
    }
    return NextResponse.json({ success: false, error: "Could not load depositable collections." }, { status: 500 });
  }
}
