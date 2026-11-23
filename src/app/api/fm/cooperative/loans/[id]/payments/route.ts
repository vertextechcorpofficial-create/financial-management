import { serveLoanPayment } from "../../_payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

async function handle(request: Request, { params }: Context) {
  return serveLoanPayment(request, Number((await params).id), "loans");
}

export { handle as GET, handle as POST };
