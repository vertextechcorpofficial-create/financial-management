import {
  createAsset,
  fetchAssets,
  fetchDepartments,
  fetchItemClassifications,
  fetchItemTypes,
  fetchItems,
  fetchUsers,
  fetchConditions,
  updateAsset,
  fetchGeneralSetting,
  generateAssetTag,
  checkRfidUnique,
  deactivateAsset,
} from "@/modules/financial-management/asset-management/registration/services/asset";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");

    let data;
    switch (type) {
      case "departments":
        data = await fetchDepartments();
        break;
      case "users":
        data = await fetchUsers();
        break;
      case "item_types":
        data = await fetchItemTypes();
        break;
      case "item_classifications":
        data = await fetchItemClassifications();
        break;
      case "conditions":
        data = await fetchConditions();
        break;
      case "items":
        data = await fetchItems();
        break;
      case "asset_tag":
        const classification = searchParams.get("classification") || "General";
        data = { tag: await generateAssetTag(classification) };
        break;
      case "check_rfid":
        const rfid = searchParams.get("rfid") || "";
        data = await checkRfidUnique(rfid);
        break;
      case "setting":
        const key = searchParams.get("key");
        if (!key) throw new Error("Setting key is required");
        data = await fetchGeneralSetting(key);
        break;
      default:
        data = await fetchAssets();
    }

    return NextResponse.json(data);
  } catch (error: unknown) {
    console.error("GET Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const result = await createAsset(body);
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    console.error("POST Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 400 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const result = await updateAsset(body);
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    console.error("PATCH Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const body = (await req.json()) as { id: number; reason: string };
    const result = await deactivateAsset(body.id, body.reason);
    return NextResponse.json({ success: true, data: result });
  } catch (error: unknown) {
    console.error("DELETE Error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 400 },
    );
  }
}
