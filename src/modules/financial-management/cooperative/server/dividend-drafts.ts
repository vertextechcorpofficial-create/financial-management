import "server-only";

import { z } from "zod";
import { dividendInputs, type DividendDraft, type DividendInputs } from "../console/dividends/types";
import { cooperativeAuditEvent } from "./audit";
import { dividendSourceChange, isCooperativeWriteCollision, readDividendSourceRevision } from "./dividend-source";
import { requireUnpostedDividendYear } from "./dividend-runs";
import { cooperativeDirectus, readDirectusItems } from "./directus";
import type { LoanActor } from "./loan-commands";
import { MemberError } from "./member-errors";
import { todayManila } from "./member-read";

const collection = "cooperative_dividend_drafts";
const id = z.number().int().positive();
const decimal = z.union([z.string(), z.number()]).transform(String);
const draftRow = z.object({
  id, calendar_year: z.number().int(), revision: id,
  net_surplus: decimal, reserve_percent: decimal, education_percent: decimal, savings_share_percent: decimal,
  audit_event_id: z.object({ actor_user_id: id, actor_name: z.string().nullish(), occurred_at: z.string() }),
});
const saveInput = dividendInputs.extend({
  expectedRevision: z.number().int().nonnegative().max(2_147_483_646),
});

export function parseDividendYear(value: string, today = todayManila()) {
  const year = Number(value);
  if (!/^[1-9]\d{3}$/.test(value) || year > Number(today.slice(0, 4))) {
    throw new MemberError(422, "Choose the current Manila year or an earlier calendar year.", "DIVIDEND_YEAR", "year");
  }
  return year;
}

async function readDraft(filter: object) {
  const query = new URLSearchParams({
    fields: "id,calendar_year,revision,net_surplus,reserve_percent,education_percent,savings_share_percent,audit_event_id.actor_user_id,audit_event_id.actor_name,audit_event_id.occurred_at",
    sort: "-revision,-id", limit: "1", filter: JSON.stringify(filter),
  });
  const { data: [row] } = z.object({ data: draftRow.array().max(1) }).parse(await readDirectusItems(collection, query));
  if (!row) return null;
  const actorId = row.audit_event_id.actor_user_id;
  const draft: DividendDraft = {
    id: row.id, year: row.calendar_year, revision: row.revision,
    values: dividendInputs.parse({
      netSurplus: row.net_surplus, reservePercent: row.reserve_percent,
      educationPercent: row.education_percent, savingsSharePercent: row.savings_share_percent,
    }),
    savedBy: row.audit_event_id.actor_name?.trim() || `User ${actorId}`,
    savedAt: row.audit_event_id.occurred_at,
  };
  return { draft, actorId };
}

export async function getDividendDraft(year: number): Promise<DividendDraft | null> {
  return (await readDraft({ calendar_year: { _eq: year } }))?.draft ?? null;
}

function sameInputs(left: DividendInputs, right: DividendInputs) {
  return left.netSurplus === right.netSurplus && left.reservePercent === right.reservePercent &&
    left.educationPercent === right.educationPercent && left.savingsSharePercent === right.savingsSharePercent;
}

const draftChanged = () => new MemberError(409, "Someone saved a newer draft. Load the latest revision before saving again.", "DIVIDEND_DRAFT_CHANGED");

export async function saveDividendDraft(year: number, actor: LoanActor, payload: unknown): Promise<DividendDraft> {
  const parsed = saveInput.safeParse(payload);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = first.path[0];
    throw new MemberError(422, typeof field === "string" && field in dividendInputs.shape ? first.message :
      "Load the draft and enter valid reviewed values.", "DIVIDEND_DRAFT_INVALID", typeof field === "string" ? field : undefined);
  }
  const { expectedRevision, ...values } = parsed.data;
  const revision = expectedRevision + 1;
  const revisionKey = `${year}:${revision}`;
  const readAttempt = () => readDraft({ revision_key: { _eq: revisionKey } });
  for (let attempt = 0; attempt < 3; attempt++) {
    const source = await dividendSourceChange();
    await requireUnpostedDividendYear(year);
    const current = await getDividendDraft(year);
    if ((current?.revision ?? 0) !== expectedRevision) {
      const prior = await readAttempt();
      if (prior?.actorId === actor.actorId && sameInputs(prior.draft.values, values)) return prior.draft;
      throw draftChanged();
    }
    if (current && sameInputs(current.values, values)) return current;

    const audit = cooperativeAuditEvent(actor, {
      subject: { type: "DIVIDEND_DRAFT", id: year }, action: "DIVIDEND_DRAFT_SAVED",
      before: current ? { ...current.values, year, revision: current.revision } : undefined,
      after: { ...values, year, revision },
    });
    try {
      const response = await cooperativeDirectus(`/items/${collection}?fields=id`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendar_year: year, revision, revision_key: revisionKey, net_surplus: values.netSurplus,
          reserve_percent: values.reservePercent, education_percent: values.educationPercent,
          savings_share_percent: values.savingsSharePercent,
          audit_event_id: { ...audit, ...source, actor_name: actor.actorName },
        }),
      });
      const { data } = z.object({ data: z.object({ id }) }).parse(await response.json());
      return { id: data.id, year, revision, values, savedBy: actor.actorName, savedAt: audit.occurred_at };
    } catch (error) {
      const prior = await readAttempt().catch(() => null);
      if (prior?.actorId === actor.actorId && sameInputs(prior.draft.values, values)) return prior.draft;
      if (prior) throw draftChanged();
      if (!isCooperativeWriteCollision(error) || !source.dividend_source_revision ||
        await readDividendSourceRevision() < source.dividend_source_revision) break;
    }
  }
  throw new MemberError(503, "The draft could not be saved. Try again.", "DIVIDEND_DRAFT_UNAVAILABLE");
}
