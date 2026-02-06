import { NextResponse } from "next/server";
import { getVault } from "@/lib/vault";

/** List all vault keys (without values) */
export async function GET() {
  const vault = await getVault();
  const keys = await vault.list();
  return NextResponse.json({ keys });
}

/** Save or update a key */
export async function POST(req: Request) {
  const { key, value, type } = await req.json();
  if (!key?.trim() || !value?.trim()) {
    return NextResponse.json({ error: "key and value are required" }, { status: 400 });
  }

  const vault = await getVault();
  await vault.set(key.trim(), value.trim(), type || "api_key");
  return NextResponse.json({ success: true });
}

/** Delete a key */
export async function DELETE(req: Request) {
  const { key } = await req.json();
  if (!key?.trim()) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }

  const vault = await getVault();
  await vault.delete(key.trim());
  return NextResponse.json({ success: true });
}
