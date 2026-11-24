import { requireCooperativeWorkspace } from "@/modules/financial-management/cooperative/server/access";
import { MemberError } from "@/modules/financial-management/cooperative/server/member-errors";

type Access = Extract<Awaited<ReturnType<typeof requireCooperativeWorkspace>>, { ok: true }>;

function memberErrorBody(error: MemberError) {
  const details = error.details && typeof error.details === "object" ? error.details as Record<string, unknown> : undefined;
  const fieldErrors = details?.fieldErrors ?? (error.field ? { [error.field]: error.message } : undefined);
  return {
    message: error.message,
    code: error.code,
    ...(fieldErrors ? { fieldErrors } : {}),
    ...(details ? { details } : {}),
  };
}

export async function withMembers(run: (actor: Access) => Promise<Response>, workspace: "members" | "reports" = "members") {
  const access = await requireCooperativeWorkspace(workspace);
  let response: Response;
  if (!access.ok) {
    response = Response.json({ message: access.message }, { status: access.status });
  } else {
    try {
      response = await run(access);
    } catch (error) {
      response = error instanceof MemberError
        ? Response.json(memberErrorBody(error), { status: error.status })
        : Response.json({ message: (workspace === "reports" ? "Reports" : "Members") + " are temporarily unavailable. Please try again." }, { status: 503 });
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  for (const cookie of access.setCookies) response.headers.append("Set-Cookie", cookie);
  return response;
}

export function memberRouteId(value: string) {
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
}

export function missingMemberId() {
  return Response.json({ message: "The member is unavailable." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
}
