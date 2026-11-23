import type { AuthorityRule } from "./types";

// Expense approval hehe.pdf, pp. 1–2. Proposed ceilings, NOT a ratified policy.
const rows: [string, string, string | null, string, string][] = [
  ["OVERTIME", "Overtime", "3000", "20000", "50000"],
  ["OFFICE_SUPPLIES", "Office Supplies", "5000", "30000", "75000"],
  ["TRANSPORTATION", "Transportation", "2000", "15000", "30000"],
  ["BUSINESS_MEALS", "Meal Allowance / Business Meals", "2000", "15000", "30000"],
  ["FUEL", "Gasoline / Fuel", "10000", "30000", "75000"],
  ["LOCAL_TRAVEL", "Local Travel", "5000", "30000", "75000"],
  ["ACCOMMODATION", "Hotel / Accommodation", "10000", "30000", "75000"],
  ["REPAIRS_MAINTENANCE", "Repairs & Maintenance", "10000", "50000", "100000"],
  ["VEHICLE_REPAIRS", "Vehicle Repairs", "15000", "50000", "100000"],
  ["IT_SUPPLIES", "IT / Computer Supplies", "15000", "50000", "100000"],
  ["SOFTWARE", "Software / Subscriptions", "5000", "30000", "75000"],
  ["COMMUNICATION", "Communication / Internet", "5000", "30000", "75000"],
  ["MARKETING", "Advertising / Marketing", "10000", "75000", "150000"],
  ["TRAINING", "Training / Seminars", "3000", "30000", "75000"],
  ["REPRESENTATION", "Representation Expenses", "5000", "30000", "75000"],
  ["COURIER", "Courier / Delivery", "5000", "15000", "30000"],
  ["PRINTING", "Printing / Promotional Materials", "5000", "30000", "75000"],
  ["SMALL_TOOLS", "Small Tools / Equipment", "5000", "50000", "100000"],
  ["PPE", "Uniforms / PPE", "10000", "50000", "100000"],
  ["JANITORIAL", "Janitorial / General Supplies", "10000", "30000", "75000"],
  ["SECURITY", "Security Expenses", "10000", "30000", "75000"],
  ["PROFESSIONAL_FEES", "Professional / Consultancy Fees", "10000", "50000", "100000"],
  ["LEGAL_FEES", "Legal / Regulatory Fees", "10000", "50000", "100000"],
  ["OFFICE_FURNITURE", "Office Furniture", "10000", "50000", "100000"],
  ["CAPEX", "Capital Expenditure / Equipment", null, "50000", "250000"],
];
export const PROPOSED_RULES: AuthorityRule[] = rows.map(([code, name, departmentHead, generalManager, cfo], i) => ({
  code, name, page: i < 17 ? 1 : 2, departmentHead: departmentHead === null ? null : `${departmentHead}.00`,
  generalManager: `${generalManager}.00`, cfo: `${cfo}.00`, coaIds: [],
}));
export const POLICY_ASSUMPTIONS = [
  "The memo has a blank effective date and signature lines; draft rules are not authorization to spend.",
  "Centavos use continuous bands: an amount above a tier ceiling requires the next authority.",
  "The office-supplies example uses a ₱10,000 DH ceiling; the matrix says ₱5,000. This seed follows the matrix.",
  "Direct-to-tier versus sequential endorsements remains a management decision; this module calculates minimum authority only.",
  "Three-quotation triggers and temporary substitute-approver rules are not specified in the memo.",
];
