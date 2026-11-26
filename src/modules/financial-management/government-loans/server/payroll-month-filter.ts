// Directus stores Payroll months as text. Cover whole years with aligned
// prefixes and use exact values for the months in partial years.
export function payrollMonthFilter(field: "month" | "payroll_month" | "effective_month",
  first: string, last: string): object {
  if (first > last) return { [field]: { _eq: "" } };
  const firstYear = Number(first.slice(0, 4));
  const lastYear = Number(last.slice(0, 4));
  const firstMonth = Number(first.slice(5));
  const lastMonth = Number(last.slice(5));
  const months: string[] = [];
  const clauses: object[] = [];
  function addMonths(year: number, from: number, through: number) {
    for (let month = from; month <= through; month++) {
      months.push(year + "-" + String(month).padStart(2, "0"));
    }
  }
  if (firstYear === lastYear) {
    addMonths(firstYear, firstMonth, lastMonth);
  } else {
    if (firstMonth > 1) addMonths(firstYear, firstMonth, 12);
    if (lastMonth < 12) addMonths(lastYear, 1, lastMonth);
    const fullYearsEnd = lastYear - Number(lastMonth < 12);
    for (let year = firstYear + Number(firstMonth > 1); year <= fullYearsEnd;) {
      const block = [1000, 100, 10, 1].find(size => year % size === 0 && year + size - 1 <= fullYearsEnd) ?? 1;
      const prefix = block === 1 ? year + "-" : String(year / block);
      clauses.push({ [field]: { _starts_with: prefix } });
      year += block;
    }
  }
  if (months.length) clauses.push({ [field]: { _in: months } });
  return clauses.length === 1 ? clauses[0] : { _or: clauses };
}
