export const reviewItems = [
    "Capital raised and reconciliations",
    "Performance, fees and drift",
    "Gifting candidates",
    "Giving target and documents",
    "Policy and targets",
];
/** Select the saved revision independently for each financial year. */
export function latestReviewEvents(events) {
    const latest = new Map();
    for (const event of events) {
        const current = latest.get(event.fiscal_start);
        if (!current || event.revision >= current.revision)
            latest.set(event.fiscal_start, event);
    }
    return [...latest.values()].sort((a, b) => a.fiscal_start.localeCompare(b.fiscal_start));
}
