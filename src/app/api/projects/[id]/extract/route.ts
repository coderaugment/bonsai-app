import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getNotesByProject, createExtraction } from "@/db/data/notes";

const client = new Anthropic();

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const projectId = Number(id);

  // Gather all notes for this project
  const notes = await getNotesByProject(projectId);

  if (notes.length === 0) {
    return NextResponse.json(
      { error: "No notes to extract from" },
      { status: 400 }
    );
  }

  // Build a summary of notes for Claude
  const notesSummary = notes
    .map((n, i) => {
      if (n.type === "image") {
        return `[Note ${i + 1}]: (image attachment)`;
      }
      return `[Note ${i + 1}]: ${n.content}`;
    })
    .join("\n\n");

  const message = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are a project manager extracting work items from raw project notes.

Given these project notes, extract discrete work items. Classify each as feature, bug, or chore.

Return ONLY a JSON array (no markdown fencing) of objects with these fields:
- title: short descriptive title
- description: 1-2 sentence description of the work
- type: "feature" | "bug" | "chore"

Notes:
${notesSummary}`,
      },
    ],
  });

  // Parse Claude's response
  const responseText =
    message.content[0].type === "text" ? message.content[0].text : "";

  let items: { title: string; description?: string; type: string }[];
  try {
    // Strip any markdown fencing if present
    const cleaned = responseText.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
    items = JSON.parse(cleaned);
  } catch {
    return NextResponse.json(
      { error: "Failed to parse extraction results", raw: responseText },
      { status: 500 }
    );
  }

  // Insert extracted items into DB
  const inserted = await Promise.all(
    items.map((item) =>
      createExtraction({
        projectId,
        title: item.title,
        description: item.description || null,
        type: (item.type as "feature" | "bug" | "chore") || "feature",
        status: "pending",
      })
    )
  );

  return NextResponse.json(inserted);
}
