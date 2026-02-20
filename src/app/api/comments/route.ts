import { NextResponse } from "next/server";
import { getCommentsByTicketOrDocument, enrichComments, createCommentAndBumpCount } from "@/db/data/comments";
import { getSetting } from "@/db/data/settings";
import { logAuditEvent } from "@/db/data/audit";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ticketIdParam = searchParams.get("ticketId");
  const documentIdParam = searchParams.get("documentId");

  if (!ticketIdParam) {
    return NextResponse.json({ error: "ticketId required" }, { status: 400 });
  }

  const ticketId = Number(ticketIdParam);
  const documentId = documentIdParam ? Number(documentIdParam) : undefined;
  const rows = await getCommentsByTicketOrDocument(ticketId, documentId);
  const enriched = await enrichComments(rows);

  return NextResponse.json({ comments: enriched });
}

export async function POST(req: Request) {
  const body = await req.json();
  const ticketId = Number(body.ticketId);
  const { content, attachments, documentId } = body;

  if (!ticketId || (!content?.trim() && (!attachments || attachments.length === 0))) {
    return NextResponse.json({ error: "ticketId and content or attachments required" }, { status: 400 });
  }

  // Get user name from settings
  const userName = await getSetting("user_name");

  const comment = await createCommentAndBumpCount({
    ticketId,
    authorType: "human",
    authorId: null,
    content: content?.trim() || "",
    attachments: attachments ? JSON.stringify(attachments) : null,
    documentId: documentId || null,
    bumpHumanCommentAt: true,
  });

  await logAuditEvent({
    ticketId,
    event: "comment_added",
    actorType: "human",
    actorId: null,
    actorName: userName ?? "User",
    detail: `Added a comment`,
  });

  return NextResponse.json({
    success: true,
    comment: {
      id: comment.id,
      ticketId: comment.ticketId,
      authorType: comment.authorType,
      author: userName ? { name: userName } : undefined,
      content: comment.content,
      attachments,
      documentId: comment.documentId ?? undefined,
      createdAt: comment.createdAt,
    },
  });
}
