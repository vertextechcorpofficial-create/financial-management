import { assetSchema, type Asset } from "../types";
import { newLedgerId } from "./id";

export function importMonth(value = "") {
  const text = value.trim();
  let year = 0, month = 0;
  let match: RegExpMatchArray | null;
  if ((match = text.match(/^(\d{4})(?:[-/.](\d{1,2})(?:[-/.]\d{1,2})?)?$/))) {
    year = Number(match[1]); month = Number(match[2] ?? 1);
  } else if ((match = text.match(/^(\d{1,2})\/(?:\d{1,2}\/)?(\d{4})$/))) {
    month = Number(match[1]); year = Number(match[2]);
  } else if ((match = text.match(/^([a-z]{3,9})\s+(\d{4})$/i))) {
    month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(match[1].slice(0, 3).toLowerCase()) + 1;
    year = Number(match[2]);
  } else if (/^\d{5,6}$/.test(text)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Number(text) * 86400000);
    year = date.getUTCFullYear(); month = date.getUTCMonth() + 1;
  }
  return year >= 1900 && year <= 2199 && month >= 1 && month <= 12 ? `${year}-${String(month).padStart(2, "0")}` : "";
}

function columns(line: string) {
  if (line.includes("\t")) return line.split("\t").map(x => x.trim());
  const result: string[] = [];
  let field = "", quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && quoted && line[i + 1] === '"') { field += c; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === "," && !quoted) { result.push(field.trim()); field = ""; }
    else field += c;
  }
  if (quoted) throw new Error("Unclosed quote in pasted row");
  return [...result, field.trim()];
}

export function parseRegistrations(text: string, kind: Asset["kind"], entityId: string, existing: Asset[], lockThrough: string): Asset[] {
  const number = (value: string | undefined, fallback: number) => {
    const cleaned = (value ?? "").replace(/[^\d.-]/g, "");
    return cleaned ? Number(cleaned) : fallback;
  };
  const drafts = text.split(/\r?\n/).flatMap((line, index) => {
    const [name, second = "", groups = "", date, price, sixth, seventh, eighth, ninth, tenth, eleventh] = columns(line);
    const acquired = importMonth(date);
    if (!name || name.toLowerCase() === "name" || !acquired) return [];
    const tags = [...new Map(groups.split(";").map(tag => tag.trim()).filter(Boolean).map(tag => [tag.toLowerCase(), tag])).values()];
    const cost = number(price, 0);
    const methodText = eighth?.toLowerCase() ?? "";
    const method = /150/.test(methodText) ? "db150" : /double|ddb|200/.test(methodText) ? "ddb" : /sum|syd/.test(methodText) ? "syd" : "sl";
    return [{ index, asset: {
      id: newLedgerId(), kind, name, entityId, tags, acquired, cost, location: kind === "land" ? second : "",
      landId: kind === "building" && second ? existing.find(a => a.kind === "land" && a.entityId === entityId && a.name.toLowerCase() === second.toLowerCase())?.id ?? "" : "",
      growth: "compound", rate: kind === "land" ? number(sixth, 5) : 5, method, notes: "", events: [], sale: null,
      parts: kind === "building" ? [{ id: newLedgerId(), name: "Whole building", date: acquired, cost, life: number(sixth, 25) || 25, salvage: number(seventh, 10) }] : [],
      details: kind === "land" ? { area: seventh ? String(number(seventh, 0)) : "", titleNo: eighth ?? "", taxDec: ninth ?? "" }
        : { floorArea: ninth ? String(number(ninth, 0)) : "", storeys: tenth ? String(number(tenth, 0)) : "", yearBuilt: eleventh ? String(number(eleventh, 0)) : "" },
    } }];
  });
  const closed = lockThrough ? drafts.filter(({ asset }) => asset.acquired <= lockThrough).length : 0;
  if (closed) throw new Error(`${closed} rows are dated in the locked period (through ${lockThrough}).`);
  return drafts.map(({ asset, index }) => {
    const parsed = assetSchema.safeParse(asset);
    if (!parsed.success) throw new Error(`Row ${index + 1}: ${parsed.error.issues[0].message}`);
    return parsed.data;
  });
}
