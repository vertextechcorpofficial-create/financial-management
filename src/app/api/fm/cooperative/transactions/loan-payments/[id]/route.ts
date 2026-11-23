import { serveLoanPayment } from "../../../loans/_payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

async function handle(request: Request, { params }: Context) {
  return serveLoanPayment(request, Number((await params).id), "transactions");
}

export { handle as GET, handle as POST };
