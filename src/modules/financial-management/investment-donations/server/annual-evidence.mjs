import { createHash } from "node:crypto";

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

// Annual review events themselves must not invalidate the evidence they attest to.
export function annualEvidenceFingerprint(state) {
  const evidence = { journal: state.journal, registers: state.registers, periods: state.periods,
    recons: state.recons, auditEvents: state.auditEvents, masterEvents: state.masterEvents,
    periodEvents: state.periodEvents, reconciliationEvents: state.reconciliationEvents };
  return createHash("sha256").update(JSON.stringify(canonical(evidence))).digest("hex");
}
