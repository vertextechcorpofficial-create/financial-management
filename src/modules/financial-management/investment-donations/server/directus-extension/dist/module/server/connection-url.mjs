/** HTTP on the configured 100.64.0.0/10 tailnet travels inside Tailscale's
 * encrypted tunnel. Public HTTP is still rejected; deployed hosts must retain
 * their tailnet connection. Never accept connection URLs from a request body. */
export function trustedLedgerUrl(url) {
    const address = /^100\.(\d+)\.(\d+)\.(\d+)$/.exec(url.hostname);
    const tailnet = address && Number(address[1]) >= 64 && Number(address[1]) <= 127;
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return !url.username && !url.password && !url.search && !url.hash &&
        (url.protocol === "https:" || (url.protocol === "http:" && (loopback || Boolean(tailnet))));
}
export function ledgerConnectionBase(value) {
    if (!value)
        throw new Error("The ledger service URL is not configured.");
    const url = new URL(value);
    if (!trustedLedgerUrl(url))
        throw new Error("Ledger connections require HTTPS, loopback or the configured encrypted Tailscale network.");
    return url.href.replace(/\/+$/, "");
}
