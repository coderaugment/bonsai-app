import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import OpenAI from "openai";

// Lazy-init OpenAI client (avoids build errors when OPENAI_API_KEY isn't set)
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

export async function POST(req: NextRequest) {
  try {
    // Parse the multipart form data
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File;

    if (!audioFile) {
      return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
    }

    // Convert the File to a Buffer
    const bytes = await audioFile.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Create a temporary file path
    const tempFilePath = join(tmpdir(), `recording-${Date.now()}.webm`);

    try {
      // Write the buffer to a temporary file
      await writeFile(tempFilePath, buffer);

      // Create a File object from the buffer for OpenAI
      const file = new File([buffer], "recording.webm", { type: "audio/webm" });

      // Transcribe using OpenAI Whisper API
      const transcription = await getOpenAI().audio.transcriptions.create({
        file: file,
        model: "whisper-1",
        language: "en",
      });

      // Clean up the temporary file
      await unlink(tempFilePath);

      return NextResponse.json({ text: transcription.text });

    } catch (fileError) {
      // Clean up temp file if it exists
      try {
        await unlink(tempFilePath);
      } catch {
        // Ignore cleanup errors
      }
      throw fileError;
    }

  } catch (error) {
    console.error("Transcription error:", error);
    return NextResponse.json(
      { error: "Failed to transcribe audio", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
