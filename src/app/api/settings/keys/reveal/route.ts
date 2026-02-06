import { NextResponse } from "next/server";
import { getVault } from "@/lib/vault";

/** Decrypt and return a specific key value */
export async function POST(req: Request) {
  const { key } = await req.json();
  if (!key?.trim()) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }

  const vault = await getVault();
  const value = await vault.get(key.trim());

  if (value === null) {
    return NextResponse.json({ error: "Key not found" }, { status: 404 });
  }

  return NextResponse.json({ value });
}
