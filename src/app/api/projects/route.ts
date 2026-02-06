import { NextResponse } from "next/server";
import { getProjects } from "@/db/queries";

export function GET() {
  const projects = getProjects();
  return NextResponse.json({ projects });
}
