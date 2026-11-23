/** Directus timestamp precision can omit milliseconds; compare the stored second. */
export function sameAuditTimestamp(actual: unknown, expected: unknown): boolean {
    const actualTime = Date.parse(String(actual ?? ""));
    const expectedTime = Date.parse(String(expected ?? ""));
    return Number.isFinite(actualTime) && Number.isFinite(expectedTime)
        && Math.floor(actualTime / 1000) === Math.floor(expectedTime / 1000);
}
