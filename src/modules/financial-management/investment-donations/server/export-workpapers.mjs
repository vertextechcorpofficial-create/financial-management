function parseCsv(content) {
  const rows = [];
  let row = [], field = "", quoted = false, closed = false;
  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    if (quoted) {
      if (char !== '"') field += char;
      else if (content[index + 1] === '"') { field += '"'; index++; }
      else { quoted = false; closed = true; }
    } else if (char === '"' && !field && !closed) quoted = true;
    else if (char === "," || char === "\r" || char === "\n") {
      row.push(field); field = ""; closed = false;
      if (char !== ",") {
        rows.push(row); row = [];
        if (char === "\r" && content[index + 1] === "\n") index++;
      }
    } else {
      if (closed || char === '"') throw new Error("Invalid workpaper CSV quoting.");
      field += char;
    }
  }
  if (quoted) throw new Error("Unterminated workpaper CSV field.");
  if (row.length || field || closed) { row.push(field); rows.push(row); }
  return rows;
}

/** One rectangular CSV, with shared named columns and an explicit workpaper discriminator. */
export function combineCsvWorkpapers(workpapers) {
  const documents = Object.entries(workpapers).filter(([, content]) => content).map(([name, content]) => {
    const [headers, ...rows] = parseCsv(content);
    if (!headers?.length || new Set(headers).size !== headers.length || rows.some(row => row.length !== headers.length)) throw new Error("Invalid workpaper CSV columns.");
    return { name, headers, rows };
  });
  const columns = [...new Set(documents.flatMap(document => document.headers))];
  const rows = [["Workpaper", ...columns], ...documents.flatMap(document => document.rows.map(row => {
    const values = new Map(document.headers.map((header, index) => [header, row[index]]));
    return [document.name, ...columns.map(header => values.get(header) ?? "")];
  }))];
  return rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
}
