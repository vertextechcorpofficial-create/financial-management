import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultEnrollmentColumns, enrollmentCsvHeaders, enrollmentMappingError, readEnrollmentCsv } from "./import-csv.ts";

test("CSV retains reference text and physical row numbers around quoted fields and blank lines", () => {
  const text = "\ufeff" + enrollmentCsvHeaders.join(",") + "\r\n\r\n" +
    '42,SSS,Salary Loan,"0004, ""A""",2000.00,200.00,10,,2026-11\r\n' +
    '43,HDMF,Multi-Purpose Loan,"two\r\nlines",2000,200,10,0,2026-12\r\n' +
    "44,BANK,Salary Loan,000005,2000,200,10,0,2027-12\r\n";
  const parsed = readEnrollmentCsv(text);
  assert.deepEqual(parsed.headers, enrollmentCsvHeaders);
  assert.deepEqual(parsed.rows.map(row => row.rowNumber), [3, 4, 6]);
  assert.equal(parsed.rows[0].cells[3], '0004, "A"');
  assert.equal(parsed.rows[1].cells[3], "two\nlines");
  assert.equal(parsed.rows[2].cells[3], "000005");
});

test("a reordered template maps by column name and only the paid count may be omitted", () => {
  const headings = [...enrollmentCsvHeaders].reverse().filter(name => name !== "Amortizations already paid");
  const columns = defaultEnrollmentColumns(headings);
  assert.equal(columns[0], 7);
  assert.equal(columns[7], -1);
  assert.equal(enrollmentMappingError(columns, headings.length), null);
  columns[1] = columns[0];
  assert.match(enrollmentMappingError(columns, headings.length), /different CSV column/);
  columns[2] = -1;
  assert.match(enrollmentMappingError(columns, headings.length), /required field/);
});

test("a malformed quote, header-only file, and oversized batch are rejected", () => {
  assert.throws(() => readEnrollmentCsv('Heading\n"continued'), /CSV row 2/);
  assert.throws(() => readEnrollmentCsv("Heading\r\n"), /no loan rows/);
  assert.throws(() => readEnrollmentCsv("Heading\n" + "loan\n".repeat(251)), /250 loan rows/);
});
