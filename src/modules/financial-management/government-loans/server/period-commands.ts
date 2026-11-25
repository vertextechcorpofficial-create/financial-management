import "server-only";

import { z } from "zod";
import { GOVERNMENT_LOAN_PERIOD_COMMANDS } from "./directus";
import { readEnrollmentRows } from "./enrollment-sources";
import { positiveId } from "./request-input";

export async function nextPeriodCommand(month: string) {
  const [current] = await readEnrollmentRows(GOVERNMENT_LOAN_PERIOD_COMMANDS, z.object({ sequence: positiveId }),
    "sequence", { month: { _eq: month } }, 1, "-sequence,id");
  const sequence = (current?.sequence ?? 0) + 1;
  return { month, sequence, revision_key: month + ":" + sequence };
}
