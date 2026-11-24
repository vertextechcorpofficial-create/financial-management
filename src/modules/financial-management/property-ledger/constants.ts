export const LAND_DETAILS = [
  ["area", "Lot area (sq m)"], ["zoning", "Zoning / classification"],
  ["owner", "Registered owner"], ["titleNo", "Title no. (TCT / OCT)"],
  ["lotNo", "Lot / survey no."], ["taxDecNo", "Tax declaration no."],
  ["zonal", "Zonal value per sq m"], ["assessed", "Assessed value"],
] as const;
export const BUILDING_DETAILS = [
  ["floorArea", "Floor area (sq m)"], ["storeys", "Storeys"], ["yearBuilt", "Year built"],
  ["construction", "Construction type"], ["use", "Use / occupancy"], ["condition", "Condition"],
  ["permitNo", "Building permit no."], ["occupancyNo", "Occupancy permit no."],
  ["taxDecNo", "Tax declaration no."],
] as const;
export const DETAIL_LABELS: Record<string, string> = Object.fromEntries([...LAND_DETAILS, ...BUILDING_DETAILS]);
export const DETAIL_OPTIONS: Record<string, string[]> = {
  zoning: ["Residential", "Commercial", "Industrial", "Agricultural", "Institutional", "Mixed-use", "Other"],
  construction: ["Reinforced concrete", "Steel frame", "Concrete & steel", "Masonry", "Wood", "Mixed", "Other"],
  use: ["Office", "Warehouse", "Retail / commercial", "Residential", "Industrial / plant", "Mixed-use", "Other"],
  condition: ["New", "Good", "Fair", "Needs repair", "Poor"],
};
