export const reportPageSizes = [10, 25, 50] as const;

export const reportSorts = {
  ledger: { reference: "Loan reference", agency: "Agency", status: "Status", estimate: "Estimated balance" },
  remittances: { agency: "Agency", month: "Payroll month", withheld: "Withheld", remitted: "Remitted principal",
    outstanding: "Outstanding", due: "Due date", paidOn: "Payment date", daysLate: "Days late", penalty: "Penalty", reference: "Reference" },
  year: { name: "Employee", department: "Department", total: "Total withheld" },
  audit: { at: "Timestamp", actor: "User", label: "Action", reference: "Reference", detail: "Detail" },
} as const;

export type ReportKey = keyof typeof reportSorts;
