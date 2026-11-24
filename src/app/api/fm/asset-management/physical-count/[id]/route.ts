import { NextResponse } from "next/server";
import { fetchAssets } from "@/modules/financial-management/asset-management/registration/services/asset";
import { CountItemResult, CountSession } from "@/modules/financial-management/asset-management/physical-count/types";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionId = Number(id);

    const assets = await fetchAssets();

    // Mock count session metadata matching Image 3, 4, 5, 6, 7, 8
    const session: CountSession = {
      id: sessionId,
      name: sessionId === 2 ? "Q3 count — IT" : "Q4 count — Finance & HR",
      count_date: "2026-11-14",
      method_id: 1,
      method_name: "RFID",
      status_id: 1,
      status: "In progress",
      started_by: 1,
      counted_by_name: "Jun Ramos",
      started_at: "2026-11-14T08:00:00Z",
      expected_count: 9,
      found_count: 8,
      missing_count: 1,
      misplaced_count: 1,
      derecognised_found_count: 0,
      unknown_count: 1,
      untagged_count: 0,
      accuracy_percent: 88.9,
      departments: ["Finance", "Human Resources"],
      remarks: null,
    };

    // Detailed Count Results (matching Image 3, 4, 5, 6, 7, 8)
    const items: CountItemResult[] = [
      // Missing (1)
      {
        id: "res-missing-1",
        asset_id: 3,
        asset_tag: "FUR-0003",
        item_name: "Ergonomic office chair",
        rfid_code: "E28068940000500A1B2C010E",
        department_name: "Finance",
        holder_name: "Unassigned",
        carrying_amount: 16114.23,
        condition_observed: "Good",
        result_type: "missing",
        resolution: "",
        note: "",
      },
      // Found (8)
      {
        id: "res-found-1",
        asset_id: 1,
        asset_tag: "FUR-0001",
        item_name: "Boardroom table set",
        rfid_code: "E28068940000500A1B2C0006",
        department_name: "Human Resources",
        holder_name: "Jenny Cruz · Head office",
        carrying_amount: 350977.12,
        verified_by: "RFID read",
        condition_observed: "Poor",
        result_type: "found",
      },
      {
        id: "res-found-2",
        asset_id: 4,
        asset_tag: "ITE-0004",
        item_name: "Dell Latitude 5450",
        rfid_code: "E28068940000500A1B2C0102",
        department_name: "Finance",
        holder_name: "Mark Villanueva",
        carrying_amount: 37104.21,
        verified_by: "RFID read",
        condition_observed: "Fair",
        result_type: "found",
      },
      {
        id: "res-found-3",
        asset_id: 5,
        asset_tag: "ITE-0005",
        item_name: "Dell Latitude 5450",
        rfid_code: "E28068940000500A1B2C0103",
        department_name: "Human Resources",
        holder_name: "Jenny Cruz",
        carrying_amount: 37104.21,
        verified_by: "RFID read",
        condition_observed: "Good",
        result_type: "found",
      },
      {
        id: "res-found-4",
        asset_id: 9,
        asset_tag: "ITE-0009",
        item_name: "Monitor",
        rfid_code: "E28068940000500A1B2C0107",
        department_name: "Human Resources",
        holder_name: "Jenny Cruz",
        carrying_amount: 17575.01,
        verified_by: "RFID read",
        condition_observed: "New",
        result_type: "found",
      },
      {
        id: "res-found-5",
        asset_id: 10,
        asset_tag: "ITE-0010",
        item_name: "Monitor",
        rfid_code: "E28068940000500A1B2C0108",
        department_name: "Finance",
        holder_name: "Mark Villanueva",
        carrying_amount: 17575.01,
        verified_by: "RFID read",
        condition_observed: "New",
        result_type: "found",
      },
      {
        id: "res-found-6",
        asset_id: 13,
        asset_tag: "ITE-0013",
        item_name: "iPhone 15",
        rfid_code: "E28068940000500A1B2C010B",
        department_name: "Human Resources",
        holder_name: "Jenny Cruz",
        carrying_amount: 46324.70,
        verified_by: "RFID read",
        condition_observed: "Good",
        result_type: "found",
      },
      {
        id: "res-found-7",
        asset_id: 2,
        asset_tag: "FUR-0002",
        item_name: "Ergonomic office chair",
        rfid_code: "E28068940000500A1B2C010D",
        department_name: "Finance",
        holder_name: "Mark Villanueva",
        carrying_amount: 16114.23,
        verified_by: "RFID read",
        condition_observed: "Good",
        result_type: "found",
      },
      {
        id: "res-found-8",
        asset_id: 6,
        asset_tag: "FUR-0006",
        item_name: "Ergonomic office chair",
        rfid_code: "E28068940000500A1B2C0111",
        department_name: "Human Resources",
        holder_name: "Jenny Cruz",
        carrying_amount: 16114.23,
        verified_by: "RFID read",
        condition_observed: "Fair",
        result_type: "found",
      },
      // Misplaced (1)
      {
        id: "res-misplaced-1",
        asset_id: 12,
        asset_tag: "ITE-0012",
        item_name: "iPhone 15",
        rfid_code: "E28068940000500A1B2C010A",
        department_name: "Admin",
        holder_name: "Ana Bautista",
        carrying_amount: 46324.70,
        condition_observed: "Good",
        result_type: "misplaced",
        actual_department_name: "Finance",
        resolution: "Transfer to Finance",
      },
      // Unknown / untagged (1)
      {
        id: "res-unknown-1",
        rfid_code: "E2806894000050FFFF00ABCD",
        carrying_amount: 0,
        condition_observed: "Unknown",
        result_type: "unknown",
        description: "Tag not in the register — an unregistered asset, a tag from another site, or a misread.",
      },
    ];

    // Manual checklist expected list
    const expectedAssets: CountItemResult[] = [
      ...items.filter((i) => i.result_type === "found" || i.result_type === "missing"),
    ];

    // Recent reads stream
    const recentReads = [
      { epc: "E2806894000050FFFF00ABCD", is_unknown: true },
      { epc: "E28068940000500A1B2C010A", matched_tag: "ITE-0012", item_name: "iPhone 15" },
      { epc: "E28068940000500A1B2C0111", matched_tag: "FUR-0006", item_name: "Ergonomic office chair" },
      { epc: "E28068940000500A1B2C010D", matched_tag: "FUR-0002", item_name: "Ergonomic office chair" },
      { epc: "E28068940000500A1B2C010B", matched_tag: "ITE-0013", item_name: "iPhone 15" },
      { epc: "E28068940000500A1B2C0108", matched_tag: "ITE-0010", item_name: "Monitor" },
      { epc: "E28068940000500A1B2C0107", matched_tag: "ITE-0009", item_name: "Monitor" },
    ];

    return NextResponse.json({
      session,
      items,
      expectedAssets,
      recentReads,
    });
  } catch (error: unknown) {
    console.error("GET Count Session Detail Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
