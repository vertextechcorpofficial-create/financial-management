import { cookies } from "next/headers";

import { COOKIE_NAME, decodeJwtPayload } from "@/lib/auth-utils";

/** `bank_check_events.actor_id` is who performed the action; it comes from the access-token cookie. */
export async function currentUserId(): Promise<number | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  const payload = token ? decodeJwtPayload(token) : null;
  const id = Number(payload?.sub);
  return Number.isInteger(id) && id > 0 ? id : null;
}
