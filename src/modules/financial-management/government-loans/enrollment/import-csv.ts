export const enrollmentCsvHeaders = [
  "Employee ID", "Agency code", "Loan program", "Loan reference", "Loan amount", "Monthly amortization",
  "Number of amortizations", "Amortizations already paid", "First deduction month (YYYY-MM)",
] as const;

export const enrollmentCsvMaxBytes = 1024 * 1024;
export const enrollmentCsvMaxRows = 250;
export const paidColumn = 7;

type CsvRow = { rowNumber: number; cells: string[] };

export function readEnrollmentCsv(text: string, maxRows = enrollmentCsvMaxRows) {
  const rows: CsvRow[] = [];
  let cells: string[] = [];
  let value = "";
  let quoted = false;
  let closedQuote = false;
  let line = 1;
  let rowNumber = line;
  const invalid = () => new Error("Check the quotation marks in CSV row " + rowNumber + ".");
  const endCell = () => {
    cells.push(value);
    if (cells.length > 50) throw new Error("CSV row " + rowNumber + " has more than 50 columns.");
    value = "";
    closedQuote = false;
  };
  const endRow = () => {
    endCell();
    if (cells.some(cell => cell.trim())) rows.push({ rowNumber, cells });
    if (rows.length > maxRows + 1) throw new Error("Choose a CSV with up to " + maxRows + " loan rows.");
    cells = [];
  };
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const char = text[i];
    const newline = char === "\n" || char === "\r";
    if (newline) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      line++;
      if (quoted) value += "\n";
      else {
        endRow();
        rowNumber = line;
      }
    } else if (quoted && char === '"') {
      if (text[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quoted = false;
        closedQuote = true;
      }
    } else if (quoted) value += char;
    else if (char === ",") endCell();
    else if (char === '"') {
      if (value || closedQuote) throw invalid();
      quoted = true;
    } else {
      if (closedQuote) throw invalid();
      value += char;
    }
  }
  if (quoted) throw invalid();
  endRow();
  const [header, ...data] = rows;
  if (!header || !data.length) throw new Error("The CSV has no loan rows.");
  const headers = header.cells.map(cell => cell.trim());
  if (headers.some(cell => cell.length > 120)) throw new Error("Use CSV headings of 120 characters or fewer.");
  return { headers, rows: data };
}

export function defaultEnrollmentColumns(headers: string[]) {
  return enrollmentCsvHeaders.map(label => {
    const matches = headers.flatMap((header, index) => header.toLowerCase() === label.toLowerCase() ? [index] : []);
    return matches.length === 1 ? matches[0] : -1;
  });
}

export function enrollmentMappingError(columns: number[], headerCount: number) {
  const selected = columns.filter(index => index >= 0);
  if (columns.length !== enrollmentCsvHeaders.length ||
    columns.some((index, column) => index >= headerCount || index < -1 || index === -1 && column !== paidColumn)) {
    return "Map each required field to a CSV column.";
  }
  if (new Set(selected).size !== selected.length) return "Choose a different CSV column for each field.";
  return null;
}

export function enrollmentBatchReference(id: number) {
  return "BT-" + String(id).padStart(4, "0");
}
