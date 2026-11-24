export const requestDocumentFolder = "Government Loan Request Documents";

export function excludesRequestFolder(value: unknown, folder: string): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const rule = value as Record<string, unknown>;
  if (Array.isArray(rule._or)) return rule._or.length > 0 && rule._or.every(item => excludesRequestFolder(item, folder));
  if (Array.isArray(rule._and) && rule._and.some(item => excludesRequestFolder(item, folder))) return true;
  if (!rule.folder || typeof rule.folder !== "object") return false;
  const condition = rule.folder as Record<string, unknown>;
  const matches = (id: unknown) => typeof id === "string" && id.toLowerCase() === folder;
  return matches(condition._neq) ||
    (typeof condition._eq === "string" && !matches(condition._eq)) ||
    (Array.isArray(condition._in) && !condition._in.some(matches)) ||
    (Array.isArray(condition._nin) && condition._nin.some(matches)) ||
    condition._null === true;
}
