import { buildSchedule, loanTotals } from "./calculations";
import { round2 } from "./format";
import {
  CONSOLE_TODAY,
  type ConsoleState,
  type Clearance,
  type DocumentRecord,
  type JournalEntry,
  type Loan,
  type Member,
  type Product,
  type Settings,
  type Withdrawal,
} from "./types";

const products: Product[] = [
  {
    code: "SALARY",
    label: "Regular Salary / Multi-Purpose",
    short: "Salary loan",
    prefix: "SL",
    kind: "CASH",
    active: true,
    rateMin: 1,
    rateMax: 1.5,
    defaultRate: 1.25,
    methods: ["diminishing", "flat"],
    markup: 0,
    months: [6, 9, 12, 18, 24],
    limitType: "savings",
    savingsMultiple: 3,
    fixedCeiling: 0,
    minimumMembershipMonths: 6,
    frequencies: ["cutoff", "monthly"],
    modes: ["payroll", "otc"],
    penaltyPercent: 2,
    graceDays: 5,
    processingFee: 0,
    documents: ["Signed loan agreement", "Latest payslip"],
    items: [],
    description: "For tuition, home repair, medical and other personal needs.",
  },
  {
    code: "EMERGENCY",
    label: "Emergency / Calamity Advance",
    short: "Emergency advance",
    prefix: "EL",
    kind: "CASH",
    active: true,
    rateMin: 0,
    rateMax: 1,
    defaultRate: 0.5,
    methods: ["flat"],
    markup: 0,
    months: [3, 4, 5, 6],
    limitType: "fixed",
    savingsMultiple: 0,
    fixedCeiling: 25_000,
    minimumMembershipMonths: 0,
    frequencies: ["cutoff"],
    modes: ["payroll"],
    penaltyPercent: 1,
    graceDays: 10,
    processingFee: 150,
    documents: ["Signed loan agreement", "Proof of emergency"],
    items: [],
    description: "Hospitalization, calamity or urgent family needs.",
  },
  {
    code: "APPLIANCE",
    label: "Appliance & Gadget",
    short: "Appliance / gadget",
    prefix: "AP",
    kind: "GOODS",
    active: true,
    rateMin: 0,
    rateMax: 0,
    defaultRate: 0,
    methods: ["markup"],
    markup: 10,
    months: [3, 6, 9, 12],
    limitType: "none",
    savingsMultiple: 0,
    fixedCeiling: 0,
    minimumMembershipMonths: 3,
    frequencies: ["cutoff", "monthly"],
    modes: ["payroll", "otc"],
    penaltyPercent: 2,
    graceDays: 5,
    processingFee: 0,
    documents: ["Signed loan agreement", "Vendor quotation"],
    items: [
      { id: "phone", name: "Smartphone 128GB (MobileHub)", price: 9_550 },
      { id: "laptop", name: "Laptop 14\" i5 (TechPoint)", price: 32_500 },
      { id: "aircon", name: "Inverter aircon 1HP (CoolAir)", price: 24_800 },
      { id: "ref", name: "Refrigerator 7 cu.ft. (CoolAir)", price: 18_450 },
      { id: "moto", name: "Motorcycle 125cc (RideOn Motors)", price: 78_900 },
    ],
    description: "The coop pays the accredited vendor; the member pays in installments.",
  },
  {
    code: "RICE",
    label: "Rice & Commodity",
    short: "Rice / commodity",
    prefix: "RC",
    kind: "GOODS",
    active: true,
    rateMin: 0,
    rateMax: 0,
    defaultRate: 0,
    methods: ["markup"],
    markup: 5,
    months: [3, 6],
    limitType: "none",
    savingsMultiple: 0,
    fixedCeiling: 0,
    minimumMembershipMonths: 0,
    frequencies: ["cutoff"],
    modes: ["payroll"],
    penaltyPercent: 0,
    graceDays: 0,
    processingFee: 0,
    documents: ["Signed loan agreement"],
    items: [{ id: "rice25", name: "Well-milled rice, 25kg sack", price: 1_350 }],
    description: "Bulk rice program.",
  },
];

const settings: Settings = {
  membershipFee: 300,
  minimumSavings: 200,
  maintainingBalance: 1_000,
  withdrawalsPerYear: 4,
  floorMode: "fixed",
  floorFixed: 5_000,
  floorPercent: 30,
  penaltyFirst: true,
};

const memberSeed: Array<[id: string, employeeNumber: string, first: string, last: string, department: string, gross: number, statutory: number, company: number, savings: number, perCutoff: number, since: string | null]> = [
  ["M1", "EMP-10492", "Juan", "Reyes", "Production", 18_000, 2_100, 300, 42_000, 500, "2021-03-01"],
  ["M2", "EMP-10811", "Maria", "Santos", "Accounting", 22_500, 3_050, 0, 68_500, 1_000, "2019-08-16"],
  ["M3", "EMP-10233", "Andres", "Dela Cruz", "Logistics", 14_000, 1_550, 450, 18_000, 500, "2022-06-01"],
  ["M4", "EMP-10577", "Liza", "Garcia", "Human Resources", 20_000, 2_600, 0, 35_250, 750, "2020-01-16"],
  ["M5", "EMP-10920", "Ramon", "Bautista", "Maintenance", 12_500, 1_300, 800, 9_500, 500, "2023-09-01"],
  ["M6", "EMP-11045", "Carla", "Mendoza", "Quality Assurance", 16_500, 1_900, 0, 21_000, 500, "2021-11-16"],
  ["M7", "EMP-10388", "Paolo", "Villanueva", "IT", 27_000, 4_100, 0, 88_000, 1_500, "2018-05-01"],
  ["M8", "EMP-11102", "Teresa", "Aquino", "Sales", 15_000, 1_700, 200, 12_500, 500, "2025-02-16"],
];

const members: Member[] = memberSeed.map((row, index) => {
  const [id, employeeNumber, firstName, lastName, department, grossPay, statutoryDeductions, companyDeductions, savings, savingsPerCutoff, memberSince] = row;
  return {
    id,
    employeeNumber,
    firstName,
    lastName,
    department,
    grossPay,
    statutoryDeductions,
    companyDeductions,
    savings,
    averageSavings: round2(savings * (0.78 + (index % 4) * 0.03)),
    savingsPerCutoff,
    memberSince,
    status: "ACTIVE",
    agreement: memberSince
      ? {
          no: `MA-${memberSince.slice(0, 4)}-${String(index + 1).padStart(4, "0")}`,
          date: memberSince,
          savingsPerCutoff,
          initialDeposit: 0,
          fee: 300,
          signed: true,
        }
      : undefined,
  };
});

members.push({
  id: "M10",
  employeeNumber: "EMP-11230",
  firstName: "Kristine",
  lastName: "Navarro",
  department: "Production",
  grossPay: 14_500,
  statutoryDeductions: 1_600,
  companyDeductions: 0,
  savings: 0,
  averageSavings: 0,
  savingsPerCutoff: 0,
  memberSince: null,
  status: "NON_MEMBER",
});

const journal: JournalEntry[] = [];
let journalId = 0;
const addJournal = (entry: Omit<JournalEntry, "id">) => {
  journal.push({ ...entry, id: `J${++journalId}` });
};

const documents: DocumentRecord[] = [];
let documentId = 0;
const addDocument = (ownerType: DocumentRecord["ownerType"], ownerId: string, category: string, name: string, size: number, mime = "application/pdf") => {
  documents.push({
    id: `D${++documentId}`,
    ownerType,
    ownerId,
    category,
    name,
    size,
    mime,
    uploadedAt: "2026-11-01",
    uploadedBy: "Coop Officer",
  });
};

for (const member of members.filter(entry => entry.status === "ACTIVE")) {
  addDocument("member", member.id, "Valid ID", `${member.lastName}_${member.firstName}_UMID.jpg`, 380_000, "image/jpeg");
  if (member.id !== "M8" && member.id !== "M3") {
    addDocument("member", member.id, "Signed membership agreement", `${member.agreement?.no}_signed.pdf`, 286_000);
  }
}

const cashLoan = (
  id: string,
  code: string,
  memberId: string,
  productCode: Loan["productCode"],
  principal: number,
  rate: number,
  method: Loan["method"],
  months: number,
  frequency: Loan["frequency"],
  mode: Loan["mode"],
  releaseDate: string,
  agreementNo: string,
  purpose: string,
  missed: string[] = [],
  status: Loan["status"] = "ACTIVE",
): Loan => {
  const product = products.find(item => item.code === productCode)!;
  const schedule = buildSchedule({
    principal,
    rate,
    markup: product.markup,
    method,
    months,
    frequency,
    start: releaseDate,
  });
  const loan: Loan = {
    id,
    code,
    memberId,
    productCode,
    principal,
    rate,
    markup: product.markup,
    method,
    months,
    frequency,
    mode,
    purpose,
    item: null,
    status,
    issueDate: releaseDate,
    releaseDate,
    agreementNo,
    agreementSigned: true,
    releaseMethod: mode === "payroll" ? "payroll" : "cash",
    penaltyPercent: product.penaltyPercent,
    graceDays: product.graceDays,
    processingFee: product.processingFee,
    schedule,
    history: [{ date: releaseDate, text: "Agreement signed and loan released" }],
  };
  if (status === "ACTIVE") {
    addJournal({
      date: releaseDate,
      memberId,
      kind: "DISBURSEMENT",
      amount: principal,
      channel: mode,
      reference: code,
      loanId: id,
    });
    for (const installment of schedule) {
      if (installment.dueDate < CONSOLE_TODAY && !missed.includes(installment.dueDate)) {
        installment.paid = installment.total;
        addJournal({
          date: installment.dueDate,
          memberId,
          kind: "LOAN_PAYMENT",
          amount: installment.total,
          channel: mode,
          reference: code,
          loanId: id,
          installmentPart: installment.total,
          penaltyPart: 0,
        });
      }
    }
    for (const date of missed) {
      loan.history.push({ date, text: "Installment not paid; now past due" });
    }
    const totals = loanTotals(loan);
    if (totals.remaining <= 0.005) loan.status = "FULLY_PAID";
  }
  return loan;
};

const goodsLoan = (
  id: string,
  code: string,
  memberId: string,
  productCode: Loan["productCode"],
  principal: number,
  months: number,
  frequency: Loan["frequency"],
  mode: Loan["mode"],
  releaseDate: string,
  agreementNo: string,
  item: string,
  missed: string[] = [],
): Loan => {
  const product = products.find(entry => entry.code === productCode)!;
  const schedule = buildSchedule({
    principal,
    rate: 0,
    markup: product.markup,
    method: "markup",
    months,
    frequency,
    start: releaseDate,
  });
  const loan: Loan = {
    id,
    code,
    memberId,
    productCode,
    principal,
    rate: 0,
    markup: product.markup,
    method: "markup",
    months,
    frequency,
    mode,
    purpose: item,
    item,
    status: "ACTIVE",
    issueDate: releaseDate,
    releaseDate,
    agreementNo,
    agreementSigned: true,
    releaseMethod: mode === "payroll" ? "payroll" : "cash",
    penaltyPercent: product.penaltyPercent,
    graceDays: product.graceDays,
    processingFee: product.processingFee,
    schedule,
    history: [{ date: releaseDate, text: "Vendor paid; item released to member" }],
  };
  addJournal({
    date: releaseDate,
    memberId,
    kind: "DISBURSEMENT",
    amount: principal,
    channel: mode,
    reference: code,
    loanId: id,
  });
  for (const installment of schedule) {
    if (installment.dueDate < CONSOLE_TODAY && !missed.includes(installment.dueDate)) {
      installment.paid = installment.total;
      addJournal({
        date: installment.dueDate,
        memberId,
        kind: "LOAN_PAYMENT",
        amount: installment.total,
        channel: mode,
        reference: code,
        loanId: id,
        installmentPart: installment.total,
        penaltyPart: 0,
      });
    }
  }
  for (const date of missed) {
    loan.history.push({ date, text: "Installment not paid; now past due" });
  }
  return loan;
};

const pendingLoan = (
  id: string,
  code: string,
  memberId: string,
  productCode: Loan["productCode"],
  principal: number,
  rate: number,
  method: Loan["method"],
  months: number,
  frequency: Loan["frequency"],
  mode: Loan["mode"],
  issueDate: string,
  agreementNo: string,
  purpose: string,
): Loan => {
  const product = products.find(item => item.code === productCode)!;
  return {
    id,
    code,
    memberId,
    productCode,
    principal,
    rate,
    markup: product.markup,
    method,
    months,
    frequency,
    mode,
    purpose,
    item: null,
    status: "PENDING",
    issueDate,
    releaseDate: null,
    agreementNo,
    agreementSigned: true,
    releaseMethod: mode === "payroll" ? "payroll" : "cash",
    penaltyPercent: product.penaltyPercent,
    graceDays: product.graceDays,
    processingFee: product.processingFee,
    schedule: buildSchedule({
      principal,
      rate,
      markup: product.markup,
      method,
      months,
      frequency,
      start: issueDate,
    }),
    history: [{ date: issueDate, text: "Submitted for approval" }],
  };
};

const loans: Loan[] = [
  cashLoan("L1", "SL-2026-0044", "M1", "SALARY", 25_000, 1, "flat", 12, "cutoff", "payroll", "2026-05-20", "LA-2026-0041", "Home renovation"),
  goodsLoan("L2", "AP-2026-0012", "M2", "APPLIANCE", 9_550, 6, "cutoff", "payroll", "2026-08-10", "LA-2026-0042", "Smartphone 128GB (MobileHub)"),
  cashLoan("L3", "EL-2026-0007", "M5", "EMERGENCY", 10_000, 0.5, "flat", 6, "cutoff", "payroll", "2026-09-05", "LA-2026-0043", "Typhoon roof repair", ["2026-10-31"]),
  goodsLoan("L4", "RC-2026-0031", "M3", "RICE", 2_700, 3, "cutoff", "payroll", "2026-10-03", "LA-2026-0044", "Well-milled rice, 25kg sack × 2", ["2026-10-15"]),
  cashLoan("L5", "SL-2026-0039", "M6", "SALARY", 40_000, 1.5, "diminishing", 24, "cutoff", "payroll", "2026-04-12", "LA-2026-0045", "Tuition", ["2026-09-30"]),
  goodsLoan("L6", "AP-2026-0010", "M7", "APPLIANCE", 78_900, 12, "monthly", "otc", "2026-06-02", "LA-2026-0046", "Motorcycle 125cc (RideOn Motors)"),
  cashLoan("L7", "SL-2026-0021", "M4", "SALARY", 15_000, 1.25, "flat", 6, "cutoff", "payroll", "2026-02-03", "LA-2026-0047", "Car repair"),
  pendingLoan("L8", "SL-2026-0051", "M8", "SALARY", 20_000, 1.25, "diminishing", 12, "cutoff", "payroll", "2026-11-03", "LA-2026-0059", "Medical expenses"),
  pendingLoan("L9", "EL-2026-0008", "M3", "EMERGENCY", 8_000, 0.5, "flat", 4, "cutoff", "payroll", "2026-11-10", "LA-2026-0060", "Hospitalization of parent"),
];

for (const loan of loans) {
  const product = products.find(entry => entry.code === loan.productCode)!;
  if (product.kind === "GOODS") {
    addDocument("loan", loan.id, "Signed loan agreement", `${loan.agreementNo}_signed.pdf`, 205_000);
    if (loan.status !== "PENDING") addDocument("loan", loan.id, "Vendor quotation", `Quotation_${loan.code}.pdf`, 120_000);
  } else {
    addDocument("loan", loan.id, "Signed loan agreement", `${loan.agreementNo}_signed.pdf`, 205_000);
    if (loan.status !== "PENDING" && loan.productCode === "SALARY") {
      addDocument("loan", loan.id, "Latest payslip", `Payslip_${loan.issueDate.slice(0, 7)}.pdf`, 96_000);
    }
  }
}
addDocument("loan", "L9", "Proof of emergency", "Hospital_admission_slip.jpg", 640_000, "image/jpeg");

const withdrawals: Withdrawal[] = [
  {
    id: "W1",
    code: "WD-2026-0017",
    memberId: "M4",
    amount: 5_000,
    reason: "School supplies",
    method: "payroll",
    status: "PENDING",
    date: "2026-11-10",
    history: [{ date: "2026-11-10", text: "Requested by Liza Garcia" }],
  },
  {
    id: "W2",
    code: "WD-2026-0016",
    memberId: "M2",
    amount: 3_000,
    reason: "Home repair",
    method: "payroll",
    status: "RELEASED",
    date: "2026-10-05",
    history: [
      { date: "2026-10-04", text: "Requested by Maria Santos" },
      { date: "2026-10-05", text: "Approved and released to payroll account" },
    ],
  },
];
addJournal({
  date: "2026-10-05",
  memberId: "M2",
  kind: "WITHDRAWAL",
  amount: 3_000,
  channel: "payroll",
  reference: "WD-2026-0016",
});

const cases: Clearance[] = [
  {
    id: "C1",
    code: "CL-2026-0003",
    memberId: "M6",
    reason: "RESIGNATION",
    separationDate: "2026-11-30",
    finalPay: 16_500,
    notes: "Last working day 30 Nov 2026",
    status: "DRAFT",
    history: [{ date: "2026-11-06", text: "Clearance started after resignation letter was received" }],
  },
];
addDocument("case", "C1", "Resignation or separation letter", "Mendoza_resignation_letter.pdf", 154_000);

for (const member of members.filter(entry => entry.status === "ACTIVE")) {
  const dates = ["2026-07-15", "2026-08-15", "2026-09-15", "2026-10-15", "2026-10-31", "2026-11-10"];
  for (const date of dates) {
    addJournal({
      date,
      memberId: member.id,
      kind: "DEPOSIT",
      amount: member.savingsPerCutoff,
      channel: "payroll",
      reference: `PB-${date.replaceAll("-", "")}-A`,
    });
  }
  const deposited = member.savingsPerCutoff * dates.length;
  const withdrawal = member.id === "M2" ? 3_000 : 0;
  const otc = member.id === "M7" ? 5_000 : 0;
  const balanceForward = round2(member.savings + withdrawal - deposited - otc);
  if (balanceForward > 0) {
    addJournal({
      date: "2026-06-01",
      memberId: member.id,
      kind: "DEPOSIT",
      amount: balanceForward,
      channel: "system",
      reference: "BALANCE-FWD",
    });
  }
}
addJournal({
  date: "2026-10-20",
  memberId: "M7",
  kind: "DEPOSIT",
  amount: 5_000,
  channel: "otc",
  reference: "OR-2026-1182",
});

journal.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

export function createConsoleState(): ConsoleState {
  return {
    products: products.map(product => ({ ...product, items: product.items.map(item => ({ ...item })) })),
    members: members.map(member => ({
      ...member,
      agreement: member.agreement ? { ...member.agreement } : undefined,
      application: member.application ? { ...member.application } : undefined,
    })),
    loans: loans.map(loan => ({
      ...loan,
      schedule: loan.schedule.map(installment => ({ ...installment })),
      history: loan.history.map(entry => ({ ...entry })),
    })),
    withdrawals: withdrawals.map(withdrawal => ({ ...withdrawal, history: withdrawal.history.map(entry => ({ ...entry })) })),
    cases: cases.map(clearance => ({ ...clearance, history: clearance.history.map(entry => ({ ...entry })) })),
    documents: documents.map(document => ({ ...document })),
    journal: journal.map(entry => ({ ...entry })),
    settings: { ...settings },
    dividend: {
      surplus: 48_000,
      reservePercent: 10,
      educationPercent: 10,
      savingsSharePercent: 70,
      posted: false,
    },
  };
}
