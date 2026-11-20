/**
 * Sanitizes strings, repairs broken UTF-8 encoding (e.g. â€“ -> –),
 * and normalizes dashes to standard hyphens or em-dashes where appropriate.
 */
export function sanitizeText(text: string | null | undefined): string {
  if (!text) return "";

  return text
    // Replace broken UTF-8 encoding artifacts
    .replace(/â€“/g, "–")
    .replace(/â€”/g, "—")
    .replace(/â€™/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€\x9d/g, '"')
    .replace(/â‚±/g, "₱")
    .replace(/\u00A0/g, " ")
    .trim();
}
