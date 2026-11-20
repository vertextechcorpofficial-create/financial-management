import { requireCooperativeWorkspace } from "@/modules/financial-management/cooperative/server/access";
import { getDashboard } from "@/modules/financial-management/cooperative/server/dashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireCooperativeWorkspace("dashboard");
  let response: Response;
  if (!access.ok) {
    response = Response.json({ message: access.message }, { status: access.status });
  } else {
    try {
      response = Response.json(await getDashboard(access.workspaces.map(workspace => workspace.key)));
    } catch {
      response = Response.json({ message: "Could not load the Dashboard." }, { status: 503 });
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Vary", "Cookie");
  for (const cookie of access.setCookies) response.headers.append("Set-Cookie", cookie);
  return response;
}
