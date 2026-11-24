export type EnrollmentImportRow = {
  rowNumber: number;
  employee: string;
  agency: string;
  program: string;
  reference: string;
  amortization: string;
  installments: string;
  paid: string;
  month: string;
  payrollLoanId: number | null;
  errors: string[];
  warnings: string[];
};

export type EnrollmentImportPreview = {
  headers: string[];
  columns: number[];
  mappingError: string | null;
  token: string | null;
  openMonth: string;
  rows: EnrollmentImportRow[];
  totals: { ready: number; skipped: number; warnings: number; monthlyAmortization: string };
};

export type EnrollmentImportBatch = {
  id: number;
  filename: string;
  createdAt: string;
  actorName: string;
  openMonth: string;
  totals: EnrollmentImportPreview["totals"];
};

export type EnrollmentImportHistory = EnrollmentImportBatch & {
  rows: EnrollmentImportRow[];
  loans: { id: number; rowNumber: number }[];
};
