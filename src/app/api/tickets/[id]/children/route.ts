import { NextResponse } from "next/server";
import { getEpicChildren } from "@/db/data";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const children = await getEpicChildren(Number(id));
  return NextResponse.json(children);
}
