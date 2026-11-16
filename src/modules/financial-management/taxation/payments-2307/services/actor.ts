import "server-only";

import { cookies } from "next/headers";

import { COOKIE_NAME, decodeJwtPayload } from "@/lib/auth-utils";
import { asString, listItems } from "./directus";

/** Who is writing, for `created_by` and every `tax_change_log` row. */
export interface Actor {
  userId: number | null;
  userName: string | null;
}

function clean(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

/**
 * Reads the signed-in user from the access-token cookie.
 *
 * A missing or unreadable cookie is not an error here: the middleware already guards
 * the route, and an actor of `null` is still an honest audit row ("the app could not
 * name the user") rather than a fabricated name.
 */
export async function currentActor(): Promise<Actor> {
  const store = await cookies();
  const payload = decodeJwtPayload(store.get(COOKIE_NAME)?.value ?? "");
  if (!payload) return { userId: null, userName: null };

  const id = Number(payload.sub);
  const userId = Number.isFinite(id) && id > 0 ? Math.trunc(id) : null;
  const name = [clean(payload.FirstName), clean(payload.LastName)].filter(Boolean).join(" ");
  return { userId, userName: clean(name) ?? clean(payload.email) };
}

/**
 * Names behind the ids the tables store (`tax_payment.created_by`, `tax_period_lock.locked_by`).
 *
 * The change log only names rows written since it existed, so a seeded row would otherwise print a
 * bare `#24`. The user table sits on the same instance; when it cannot be read the id stays in the
 * tooltip and the cell prints a dash rather than a number pretending to be a person.
 */
export async function loadUserNames(ids: Array<number | null>): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  const unique = Array.from(new Set(ids.filter((id): id is number => typeof id === "number" && id > 0)));
  if (unique.length === 0) return names;

  try {
    const { rows } = await listItems<Record<string, unknown>>("user", {
      fields: ["user_id", "user_fname", "user_mname", "user_lname", "user_email"],
      filter: { user_id: { _in: unique } },
      limit: unique.length,
    });
    for (const row of rows) {
      const id = Number(row.user_id);
      const fullName = [asString(row.user_fname), asString(row.user_mname), asString(row.user_lname)]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(" ");
      const label = fullName || asString(row.user_email).trim();
      if (Number.isInteger(id) && id > 0 && label) names.set(id, label);
    }
  } catch {
    // An unreadable user table leaves the ids; the cells print a dash with the id in the title.
  }
  return names;
}
