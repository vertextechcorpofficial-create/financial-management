import { centavos } from "../../payroll-handoff/contract";
import { amountFromCentavos } from "../../loans/position";

export function remittanceLiability(withheld: string | null, payments: { state: string; withheld: string; entered_penalty: string }[]) {
  let paid = 0n;
  let penalty = 0n;
  for (const payment of payments) {
    if (payment.state !== "APPROVED") continue;
    paid += centavos(payment.withheld);
    penalty += centavos(payment.entered_penalty);
  }
  return { withheld, paid: amountFromCentavos(paid), penalty: amountFromCentavos(penalty),
    cashOut: amountFromCentavos(paid + penalty),
    remaining: withheld === null ? null : amountFromCentavos(centavos(withheld) - paid) };
}
