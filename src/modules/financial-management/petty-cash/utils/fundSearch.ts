export type FundSearchable = {
  docNo: string;
  name: string;
  custodian?: string;
  custodianName?: string;
};

export const fundCustodian = (fund: FundSearchable) => fund.custodianName || fund.custodian || "";

export const fundDisplayLabel = (fund: FundSearchable) =>
  `${fund.docNo} - ${fund.name}${fundCustodian(fund) ? ` - ${fundCustodian(fund)}` : ""}`;

export const normalizeFundSearch = (value: string) =>
  value.toLowerCase().replace(/\s*-\s*/g, " ").replace(/\s+/g, " ").trim();

export const fundMatchesSearch = (fund: FundSearchable, search: string) => {
  const term = normalizeFundSearch(search);
  return !term || normalizeFundSearch(fundDisplayLabel(fund)).includes(term);
};
