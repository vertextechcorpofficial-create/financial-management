import { NextResponse } from "next/server";
import {
  fetchActiveCompanyList,
  getCompanyServiceKeys,
  getUserCompanyCode,
  ClientCompanyOption,
} from "@/modules/financial-management/financial-statements/statement-of-cash-flows/services/company-directory.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [dbCompanies, userCompanyCode] = await Promise.all([
    fetchActiveCompanyList(),
    getUserCompanyCode(),
  ]);

  const serviceKeys = getCompanyServiceKeys();

  const options: ClientCompanyOption[] = [];

  // 1. Group Option at the top
  options.push({
    code: "GRP",
    name: "Group (Combined before eliminations)",
    hasKey: true,
    isOwnCompany: false,
  });

  // 2. Active companies from company_list
  if (dbCompanies.length > 0) {
    for (const c of dbCompanies) {
      if (!c.company_code) continue;
      const code = c.company_code.trim();
      const isOwn = userCompanyCode ? code.toLowerCase() === userCompanyCode.toLowerCase() : false;
      const hasKey = isOwn || Boolean(serviceKeys[code]);

      options.push({
        code,
        name: c.company_name || code,
        companyId: c.company_id,
        isMotherCompany: Boolean(c.is_mother_company),
        hasKey,
        isOwnCompany: isOwn,
      });
    }
  } else {
    // Fallback if company_list is currently unreachable, including MEN2
    const knownCodes = ["MEN2", "VTC", "HC", "RC2", "C", "MFTG", "RSM", "HR", "ACE", "MENZA"];
    for (const code of knownCodes) {
      const isOwn = userCompanyCode ? code.toLowerCase() === userCompanyCode.toLowerCase() : false;
      const hasKey = isOwn || Boolean(serviceKeys[code]);
      options.push({
        code,
        name: code === "MEN2" ? "MEN2 (Dummy ERP)" : `${code} Company`,
        hasKey,
        isOwnCompany: isOwn,
      });
    }
  }

  return NextResponse.json({
    success: true,
    companies: options,
    userCompanyCode,
  });
}
