import "server-only";

import { z } from "zod";
import { calculateDividendPreview, saveDividendAllocation } from "../console/dividends/allocation";
import type { DividendPostingPreview } from "../console/dividends/types";
import { centsToAmount } from "../loans/loan-schedule";
import { accountSchema } from "../policies/policy-types";
import { getDividendBasis } from "./dividend-basis";
import { getDividendDraft } from "./dividend-drafts";
import { requireUnpostedDividendYear } from "./dividend-runs";
import { readDividendSourceRevision } from "./dividend-source";
import { readDirectusPages, usesCooperativeQaDatabase } from "./directus";
import { loanDigest, loanPostingAccounts, requirePostingAccount } from "./loan-commands";
import { readCooperativeChart } from "./ledger-report";
import { MemberError } from "./member-errors";
import { amountToCents, todayManila } from "./member-read";

const balance = z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/));
const member = z.object({
  id: z.number().int().positive(), status: z.enum(["ACTIVE", "SEPARATED"]),
  savings_balance: balance, savings_revision: z.number().int().nonnegative(),
  savings_entries: z.object({ entry_date: z.iso.date(), balance_after: balance }).array().max(1),
});
type Journal = DividendPostingPreview["journalPreview"][number];
const dividendPurposes = [
  "UNDIVIDED_NET_SURPLUS", "RESERVE_FUND", "EDUCATION_AND_TRAINING_FUND",
  "SAVINGS_INTEREST_PAYABLE", "PATRONAGE_REFUND_PAYABLE", "MEMBER_SAVINGS",
] as const;

async function readDividendAccounts() {
  const id = z.number().int().positive();
  const shape = z.object({ id, purpose: z.enum(dividendPurposes), account_id: id });
  const [mappings, chart] = await Promise.all([
    readDirectusPages("cooperative_account_mappings", shape, {
      fields: "id,purpose,account_id", filter: JSON.stringify({ purpose: { _in: dividendPurposes } }),
    }),
    readCooperativeChart(),
  ]);
  const mapped = new Set(mappings.map(row => row.account_id));
  return loanPostingAccounts({
    mappings: mappings.map(row => ({ id: row.id, purpose: row.purpose, accountId: row.account_id })),
    accounts: chart.filter(row => mapped.has(row.id)).map(({ id, code, name, classification, is_active, is_contra }) => ({
      id, ...accountSchema.parse({ code, name, classification, isActive: is_active, isContra: is_contra }),
    })),
  });
}

async function readDividendRecipients(ids: number[]) {
  const members = new Map<number, z.output<typeof member>>();
  for (let offset = 0; offset < ids.length; offset += 50) {
    const rows = await readDirectusPages("cooperative_memberships", member, {
      fields: "id,status,savings_balance,savings_revision,savings_entries.entry_date,savings_entries.balance_after",
      filter: JSON.stringify({ id: { _in: ids.slice(offset, offset + 50) } }),
      "deep[savings_entries][_sort]": "-entry_date,-id",
      "deep[savings_entries][_limit]": "1",
    });
    for (const row of rows) members.set(row.id, row);
  }
  return members;
}

async function calculateReview(year: number, postingDate: string) {
  await requireUnpostedDividendYear(year);
  const draft = await getDividendDraft(year);
  if (!draft) throw new MemberError(422, "Save the reviewed annual draft before posting.", "DIVIDEND_DRAFT_REQUIRED");
  const [basis, accounts] = await Promise.all([getDividendBasis(year, postingDate), readDividendAccounts()]);
  const allocation = saveDividendAllocation(calculateDividendPreview(draft.values, basis));
  const credits = allocation.credits.filter(row => row.total !== "0.00").sort((a, b) => a.membershipId - b.membershipId);
  const used = new Map<number, Parameters<typeof requirePostingAccount>[1]>();
  const account = (purpose: Parameters<typeof requirePostingAccount>[1]) => {
    const { id, code, name } = requirePostingAccount(accounts, purpose);
    if (used.has(id) && used.get(id) !== purpose) {
      throw new MemberError(422, "Assign a distinct Cooperative account to each dividend posting purpose in Policies.", "DIVIDEND_ACCOUNT_MAPPING");
    }
    used.set(id, purpose);
    return { id, code, name };
  };
  const pair = (amount: string, debit: Parameters<typeof account>[0], credit: Parameters<typeof account>[0]): Journal["pairs"] =>
    amount === "0.00" ? [] : [{ amount, debit: account(debit), credit: account(credit) }];
  const journalPreview: Journal[] = [];
  function addJournal(kind: Journal["kind"], pairs: Journal["pairs"], membershipId: number | null = null) {
    if (pairs.length) journalPreview.push({ kind, pairs, membershipId });
  }
  addJournal("STATUTORY", [
    ...pair(allocation.reserve, "UNDIVIDED_NET_SURPLUS", "RESERVE_FUND"),
    ...pair(allocation.education, "UNDIVIDED_NET_SURPLUS", "EDUCATION_AND_TRAINING_FUND"),
  ]);
  addJournal("DECLARATION", [
    ...pair(allocation.savings.allocated, "UNDIVIDED_NET_SURPLUS", "SAVINGS_INTEREST_PAYABLE"),
    ...pair(allocation.patronage.allocated, "UNDIVIDED_NET_SURPLUS", "PATRONAGE_REFUND_PAYABLE"),
  ]);

  const members = await readDividendRecipients(credits.map(row => row.membershipId));
  const recipients = credits.map(row => {
    const member = members.get(row.membershipId);
    const latest = member?.savings_entries[0];
    if (!member || member.status !== "ACTIVE") {
      throw new MemberError(409, "A recipient's membership changed. Refresh the review.", "DIVIDEND_PREVIEW_CHANGED");
    }
    const before = amountToCents(member.savings_balance);
    if ((latest && latest.entry_date > postingDate) || before !== amountToCents(latest?.balance_after ?? "0.00")) {
      throw new MemberError(409, "A recipient's savings balance needs reconciliation before posting.", "DIVIDEND_SAVINGS_MISMATCH");
    }
    const after = before + amountToCents(row.total);
    if (after > 999_999_999_999n) {
      throw new MemberError(422, "A dividend would put a recipient's savings above the supported balance.", "DIVIDEND_SAVINGS_LIMIT");
    }
    addJournal("MEMBER_CREDIT", [
      ...pair(row.savingsCredit, "SAVINGS_INTEREST_PAYABLE", "MEMBER_SAVINGS"),
      ...pair(row.patronageRefund, "PATRONAGE_REFUND_PAYABLE", "MEMBER_SAVINGS"),
    ], row.membershipId);
    return { membershipId: row.membershipId, before: centsToAmount(before), after: centsToAmount(after) };
  });
  const reviewed = { draft, postingDate, basis, allocation, recipients, journalPreview };
  const preview: DividendPostingPreview = { ...reviewed, fingerprint: loanDigest(reviewed) };
  return { preview, members };
}

export async function reviewDividendPosting(year: number, now = new Date()) {
  if (!usesCooperativeQaDatabase()) {
    throw new MemberError(409, "Dividend posting is pending rollout in this environment.", "PENDING_ROLLOUT");
  }
  const postingDate = todayManila(now);
  if (`${year}-12-31` >= postingDate) {
    throw new MemberError(422, "Post dividends after the Manila calendar year ends.", "DIVIDEND_YEAR_OPEN");
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    const revision = await readDividendSourceRevision();
    try {
      const reviewed = await calculateReview(year, postingDate);
      if (await readDividendSourceRevision() === revision) return { ...reviewed, revision };
    } catch (error) {
      if (await readDividendSourceRevision() === revision) throw error;
    }
  }
  throw new MemberError(409, "Dividend sources are changing. Refresh the review and try again.", "DIVIDEND_PREVIEW_CHANGED");
}
