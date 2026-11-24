export type CertificateEvent = { date: string; action: "surrender" | "restore" | "void"; transferId: string };
export type Certificate = { id: string; no: string; holderId: string; shares: number; date: string;
  cancelledAt?: string | null; cancelledBy?: string | null; voidedAt?: string;
  history?: CertificateEvent[] };

export function certificateHistory(cert: Certificate): CertificateEvent[] {
  if (cert.history) return cert.history;
  return [
    ...(cert.cancelledAt ? [{ date: cert.cancelledAt, action: "surrender" as const, transferId: cert.cancelledBy ?? "" }] : []),
    ...(cert.voidedAt ? [{ date: cert.voidedAt, action: "void" as const, transferId: "" }] : []),
  ];
}

export function certificateActiveAt(cert: Certificate, date: string) {
  if (cert.date > date) return false;
  let active = true;
  for (const event of certificateHistory(cert)) {
    if (event.date <= date) active = event.action === "restore";
  }
  return active;
}
