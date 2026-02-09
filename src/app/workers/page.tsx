"use client";

import { WorkersView } from "@/components/board/workers-view";

// Legacy unscoped route. Project-scoped route is at /p/[slug]/workers.
export default function WorkersPage() {
  return <WorkersView />;
}
