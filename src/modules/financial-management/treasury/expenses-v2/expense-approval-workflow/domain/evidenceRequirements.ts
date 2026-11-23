export const EVIDENCE_REQUIREMENTS: Record<string, string[]> = {
  OVERTIME: ["Approved OT request", "Actual time records", "Operational justification", "Manpower / overtime budget", "Finance / HR validation"],
  FUEL: ["Vehicle identification", "Driver / user", "Travel purpose and date", "Official receipt / fuel card record", "Odometer where applicable"],
  BUSINESS_MEALS: ["Business purpose and date", "Participants", "Business relationship where applicable", "Official receipt"],
  REPRESENTATION: ["Business purpose and date", "Participants", "Business relationship where applicable", "Official receipt"],
  TRANSPORTATION: ["Employee", "Destination and date", "Business purpose", "Receipt / approved transportation claim"],
  REPAIRS_MAINTENANCE: ["Appropriate repair request", "Quotation / assessment where practical"],
  VEHICLE_REPAIRS: ["Appropriate repair request", "Quotation / assessment where practical"],
};
export function evidenceRequirements(code: string): string[] {
  return EVIDENCE_REQUIREMENTS[code] || ["Legitimate business purpose", "Supporting documents", "Finance review"];
}
