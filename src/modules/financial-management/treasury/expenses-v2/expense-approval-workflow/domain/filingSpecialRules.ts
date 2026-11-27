/** Item 4, Expense approval hehe.pdf p.2. Declarations/references are NOT verification. */
export type SpecialField = {
  key: string; label: string; required?: boolean; document?: boolean;
  options?: readonly string[]; help?: string;
};
export type SpecialDetails = Record<string, string>;
const document = (key: string, label: string, required = true): SpecialField => ({ key, label, required, document: true });
const field = (key: string, label: string, required = true): SpecialField => ({ key, label, required });
const applicability = (key: string, label: string): SpecialField => ({ key, label, required: true, options: ["Applicable", "Not applicable"] });
export const PURCHASE_CATEGORIES = ["OFFICE_SUPPLIES", "IT_SUPPLIES", "SMALL_TOOLS", "PPE", "JANITORIAL", "OFFICE_FURNITURE", "CAPEX"];
export function specialFields(category: string, details: SpecialDetails = {}): SpecialField[] {
  let fields: SpecialField[] = [];
  if (category === "OVERTIME") fields = [
    document("otRequest", "Approved overtime request"), document("timeRecords", "Actual time records"),
    field("operationalJustification", "Operational justification"),
  ];
  if (category === "FUEL") fields = [
    field("vehicle", "Vehicle identification"), field("driver", "Driver / user"),
    document("fuelRecord", "Official receipt or fuel card record"),
    applicability("mileageApplicability", "Mileage / odometer applicability"),
    ...(details.mileageApplicability === "Applicable" ? [field("odometer", "Mileage / odometer reading")] : []),
    { key: "fuelUse", label: "Fuel use", required: true, options: ["Business", "Specifically authorized personal use"] },
    ...(details.fuelUse === "Specifically authorized personal use" ? [document("fuelAuthorization", "Specific personal-use authorization")] : []),
  ];
  if (["BUSINESS_MEALS", "REPRESENTATION"].includes(category)) fields = [
    field("participants", "Participants"), applicability("relationshipApplicability", "Customer / vendor / business relationship applicability"),
    ...(details.relationshipApplicability === "Applicable" ? [field("businessRelationship", "Customer / vendor / business relationship")] : []),
    document("mealReceipt", "Official receipt"),
    { key: "mealUse", label: "Meal / representation purpose", required: true, options: ["Business", "Personal meal covered by approved benefit / travel policy"] },
    ...(details.mealUse === "Personal meal covered by approved benefit / travel policy" ? [document("mealPolicy", "Approved benefit / travel policy")] : []),
  ];
  if (category === "TRANSPORTATION") fields = [field("employee", "Employee"), field("destination", "Destination"), document("transportRecord", "Supporting receipt or approved transportation claim")];
  if (["REPAIRS_MAINTENANCE", "VEHICLE_REPAIRS"].includes(category)) fields = [
    document("repairRequest", "Appropriate repair request"),
    { key: "quotationPractical", label: "Quotation / assessment practical?", required: true, options: ["Yes", "No"] },
    ...(details.quotationPractical === "Yes" ? [document("repairAssessment", "Quotation or assessment")] : []),
    { ...field("repairNotes", "Repair / competitive quotation notes", false), help: "Management may require competitive quotes for major repairs; no automatic amount threshold is specified." },
  ];
  if (category) fields.push({ key: "purchase", label: "Does this expense involve a purchase?", required: true, options: ["Yes", "No"], help: "Finance/Procurement determines whether the substantial-purchase quotation rule applies; no amount threshold is specified." });
  if (details.purchase === "Yes") fields.push(
    document("quotation1", "Supplier quotation 1", false), document("quotation2", "Supplier quotation 2", false), document("quotation3", "Supplier quotation 3", false),
    { key: "purchaseException", label: "Quotation exception claimed (optional; subject to review)", options: ["Only one available supplier", "Emergency", "Management-approved exception"] },
    document("purchaseExceptionEvidence", "Quotation exception supporting evidence", false),
    { ...field("purchaseNotes", "Purchase / supplier notes", false), help: "At least three quotations may be required by Finance/Procurement for substantial purchases. A claim here does not approve an exception or waive that requirement." },
  );
  return fields;
}

export function specialRuleNotes(category: string): string[] {
  const notes = ["Expense date and business purpose above apply to these rules. Document selections are recorded references only; Finance must verify their contents."];
  if (category === "OVERTIME") notes.push("The approver must review overtime authorization, actual time records and operational justification.");
  if (category === "FUEL") notes.push("Business purpose above must describe the travel. Mileage/odometer is required only where applicable. Personal use of company fuel is prohibited unless specifically authorized.");
  if (["BUSINESS_MEALS", "REPRESENTATION"].includes(category)) notes.push("Personal meals cannot be charged unless covered by an approved company benefit or travel policy. A business relationship is required only when applicable.");
  if (category === "TRANSPORTATION") notes.push("Expense date, business purpose and amount above form part of the transportation claim.");
  if (["REPAIRS_MAINTENANCE", "VEHICLE_REPAIRS"].includes(category)) notes.push("An appropriate request is required. Quotation/assessment is required when practical; Management may require competitive quotations for major repairs.");
  return notes;
}

/** Required only on submit; incomplete drafts remain supported. Never produces a verified flag. */
export function specialRuleProblems(category: string, details: SpecialDetails, attachmentIds: readonly string[], submitting = true): string[] {
  const fields = specialFields(category, details);
  const problems: string[] = [];
  for (const f of fields) {
    const value = details[f.key]?.trim() || "";
    if (submitting && f.required && !value) problems.push(`${f.label} is required.`);
    if (value && f.options && !f.options.includes(value)) problems.push(`${f.label}: choose a listed option.`);
    if (value && f.document && !attachmentIds.includes(value)) problems.push(`${f.label}: select a document attached to this request.`);
  }
  // Reject stale/hidden data rather than silently retaining evidence from another category.
  // Preserve historical overtime budget references without requiring them on new filings.
  const allowed = new Set([...fields.map(f => f.key), ...(category === "OVERTIME" ? ["overtimeBudget"] : [])]);
  for (const [key, value] of Object.entries(details)) if (value && !allowed.has(key)) problems.push(`Remove details not applicable to the selected category: ${key}.`);
  return problems;
}

export function applicableDetails(category: string, details: SpecialDetails): SpecialDetails {
  const allowed = new Set(specialFields(category, details).map(f => f.key));
  return Object.fromEntries(Object.entries(details).filter(([key]) => allowed.has(key)));
}
