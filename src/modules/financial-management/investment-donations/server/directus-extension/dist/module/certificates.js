export function certificateHistory(cert) {
    if (cert.history)
        return cert.history;
    return [
        ...(cert.cancelledAt ? [{ date: cert.cancelledAt, action: "surrender", transferId: cert.cancelledBy ?? "" }] : []),
        ...(cert.voidedAt ? [{ date: cert.voidedAt, action: "void", transferId: "" }] : []),
    ];
}
export function certificateActiveAt(cert, date) {
    if (cert.date > date)
        return false;
    let active = true;
    for (const event of certificateHistory(cert)) {
        if (event.date <= date)
            active = event.action === "restore";
    }
    return active;
}
