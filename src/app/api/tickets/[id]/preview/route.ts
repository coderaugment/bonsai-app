import { NextRequest, NextResponse } from "next/server";
import { getTicketById } from "@/db/data/tickets";
import { getProjectById } from "@/db/data/projects";
import { getWorktreePath } from "@/lib/worktree-paths";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const ticketId = Number(id);

  // Get ticket and its project
  const ticket = await getTicketById(ticketId);
  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const project = await getProjectById(ticket.projectId);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Derive the preview port from project ID (same logic as /api/projects/[id]/preview)
  const port = 3100 + (project.id % 100);
  const devServerUrl = `http://localhost:${port}`;

  // Get the path after /preview (everything after the base URL)
  const url = new URL(request.url);
  const previewPath = url.pathname.replace(`/api/tickets/${ticketId}/preview`, "") || "/";
  const queryString = url.search;

  try {
    // Proxy the request to the dev server
    const targetUrl = `${devServerUrl}${previewPath}${queryString}`;

    const response = await fetch(targetUrl, {
      headers: {
        "User-Agent": request.headers.get("User-Agent") || "Bonsai-Preview",
        "Accept": request.headers.get("Accept") || "*/*",
        "Accept-Language": request.headers.get("Accept-Language") || "en-US,en;q=0.9",
      },
    });

    // Get the response body
    const contentType = response.headers.get("content-type") || "";

    let body: Buffer | string;
    if (contentType.includes("text/") || contentType.includes("application/json") || contentType.includes("application/javascript")) {
      body = await response.text();
    } else {
      // Binary content (images, fonts, etc.)
      body = Buffer.from(await response.arrayBuffer());
    }

    const headers = new Headers();

    // Copy relevant headers from the dev server response
    response.headers.forEach((value, key) => {
      // Skip headers that might cause issues in iframe context
      if (!["content-encoding", "transfer-encoding", "connection", "content-length"].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    });

    // Allow iframe embedding
    headers.delete("X-Frame-Options");
    headers.delete("Content-Security-Policy");

    return new NextResponse(body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    // Get worktree path for error message
    const worktreePath = getWorktreePath(project.localPath, ticket.id);

    // Only return HTML error page for HTML requests (not for assets)
    const accept = request.headers.get("Accept") || "";
    if (accept.includes("text/html")) {
      return new NextResponse(
        `<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui;color:#666;">
          <div style="text-align:center;max-width:600px;padding:20px;">
            <h2 style="margin:0 0 8px 0;color:#333;">Dev server not running</h2>
            <p style="margin:0 0 16px 0;">Start the dev server to see live changes:</p>
            <pre style="background:#f5f5f5;padding:16px;border-radius:8px;text-align:left;margin:0 0 16px 0;font-size:13px;overflow-x:auto;">cd ${worktreePath}
${project.runCommand || "npm run dev"}</pre>
            <p style="margin:0;font-size:14px;color:#999;">Error: ${error instanceof Error ? error.message : "Could not connect to dev server"}</p>
          </div>
        </body></html>`,
        { headers: { "Content-Type": "text/html" }, status: 502 }
      );
    } else {
      // For asset requests, return a simple error
      return new NextResponse(null, { status: 502 });
    }
  }
}
