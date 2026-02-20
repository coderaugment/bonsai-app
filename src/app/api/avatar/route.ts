import { NextResponse } from "next/server";
import { getSetting } from "@/db/data/settings";
import { geminiRequest, GeminiKeyError } from "@/lib/gemini";
import { appendFileSync } from "fs";

const TELEMETRY_LOG = "/tmp/avatar-telemetry.jsonl";
const MODEL = "gemini-2.5-flash-image";

const IMAGE_OUTPUT_TOKENS = 1290;
const INPUT_COST_PER_TOKEN = 0.30 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 30.0 / 1_000_000;
const IMAGE_OUTPUT_COST = IMAGE_OUTPUT_TOKENS * OUTPUT_COST_PER_TOKEN;

const DEFAULT_STYLE = `A real photograph — NOT an illustration, NOT a cartoon, NOT anime, NOT digital art, NOT 3D render. Shot on a Canon EOS R5 camera, 85mm f/1.4 lens. Real skin texture, real lighting, real depth of field. Subject fills the entire frame with blurred background extending to all edges. Soft bokeh background. Natural warm studio lighting. Friendly, confident expression. No text, no watermarks, no logos, no visible canvas edges. Square format optimized for circular crop.`;

// Always appended to every prompt regardless of style — cannot be overridden by custom styles
const FRAMING_REQUIREMENT = `\n\nFRAMING: Headshot ONLY — head, neck, and shoulders. The face MUST be fully visible and centered in the frame. Crop from crown of head to collarbone/upper shoulders. Subject and background MUST fill the entire square frame edge-to-edge with NO visible canvas, paper texture, or border. Background must extend to all four corners. CRITICAL: DO NOT show anything below the shoulders. DO NOT show chest, torso, waist, hips, arms, hands, or legs. DO NOT cut off the top of the head. The face fills most of the frame.`;

export async function POST(req: Request) {
  const { name, role, personality, style, useUserStyle, styleImage } = await req.json();

  if (!name || !role) {
    return NextResponse.json({ error: "name and role are required" }, { status: 400 });
  }

  // Resolve style image: explicit param > saved setting
  const resolvedStyleImage: string | null = styleImage || (await getSetting("avatar_style_image")) || null;

  const customStyle = await getSetting("prompt_avatar_style");
  const userStyle = useUserStyle ? await getSetting("prompt_user_avatar_style") : null;
  const stylePrompt = style || userStyle || customStyle || DEFAULT_STYLE;

  const t0 = Date.now();
  console.log(`[avatar] ${new Date().toISOString()} | model=${MODEL} | role=${role} | name=${name} | mode=${resolvedStyleImage ? "image" : "text"} | starting request`);

  // Build Gemini contents — multimodal if style image is provided
  let contents: unknown[];
  if (resolvedStyleImage) {
    const commaIdx = resolvedStyleImage.indexOf(",");
    const header = resolvedStyleImage.slice(0, commaIdx);
    const b64 = resolvedStyleImage.slice(commaIdx + 1);
    const mimeMatch = header.match(/data:([^;]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const appearance = buildAppearance(name, role, personality);
    contents = [{
      parts: [
        { text: `Generate a square portrait of ${appearance}. Match the artistic style, color palette, and rendering technique of the reference image exactly. Square format, no text, no logos, centered for circular crop.${FRAMING_REQUIREMENT}` },
        { inlineData: { mimeType, data: b64 } },
      ],
    }];
  } else {
    const prompt = buildAvatarPrompt(name, role, personality, stylePrompt);
    contents = [{ parts: [{ text: prompt }] }];
  }

  try {
    const res = await geminiRequest(MODEL, {
      contents,
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    });

    const elapsed = Date.now() - t0;
    const data = await res.json();

    const usage = data.usageMetadata ?? {};
    const inputTokens = usage.promptTokenCount ?? 0;
    const outputTokens = usage.candidatesTokenCount ?? usage.totalTokenCount ?? IMAGE_OUTPUT_TOKENS;
    const inputCost = inputTokens * INPUT_COST_PER_TOKEN;
    const outputCost = outputTokens > 100 ? IMAGE_OUTPUT_COST : outputTokens * OUTPUT_COST_PER_TOKEN;
    const totalCost = inputCost + outputCost;

    const candidates = data.candidates ?? [];
    for (const candidate of candidates) {
      const parts = candidate.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData) {
          const { mimeType, data: b64 } = part.inlineData;
          const dataUrl = `data:${mimeType};base64,${b64}`;
          const logLine = { ts: new Date().toISOString(), model: MODEL, status: "ok", elapsedMs: elapsed, mimeType, sizeKB: Math.round(b64.length / 1024), inputTokens, outputTokens, costUSD: +totalCost.toFixed(4), role, name };
          console.log(`[avatar] ${logLine.ts} | model=${MODEL} | OK | ${elapsed}ms | ${mimeType} | ${logLine.sizeKB}KB | in=${inputTokens} out=${outputTokens} | cost=$${totalCost.toFixed(4)}`);
          try { appendFileSync(TELEMETRY_LOG, JSON.stringify(logLine) + "\n"); } catch {}
          return NextResponse.json({ success: true, avatar: dataUrl });
        }
      }
    }

    console.error(`[avatar] ${new Date().toISOString()} | model=${MODEL} | NO IMAGE | ${elapsed}ms`);
    return NextResponse.json({ error: "No image in response" }, { status: 502 });
  } catch (err) {
    const elapsed = Date.now() - t0;
    if (err instanceof GeminiKeyError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 401 });
    }
    console.error(`[avatar] ${new Date().toISOString()} | model=${MODEL} | ERROR | ${elapsed}ms |`, err);
    return NextResponse.json({ error: "Avatar generation failed" }, { status: 500 });
  }
}

function buildAppearance(name: string, role: string, personality: string | undefined): string {
  const fallbacks: Record<string, string> = {
    lead: "a team lead with polished collar, confident smile, well-groomed",
    researcher: "a research analyst with wire-frame glasses, button-down collar visible",
    developer: "a software developer with hoodie, messy hair, glasses",
    designer: "a UI/UX designer with stylish glasses, creative hairstyle",
    critic: "a sharp-eyed critic with intense gaze, turtleneck collar",
    hacker: "a security engineer in dark hoodie, focused expression",
  };

  let appearance = fallbacks[role] || fallbacks.developer;
  if (personality) {
    const firstParagraph = personality.split("\n\n")[0].trim();
    if (firstParagraph.length > 10) {
      appearance = firstParagraph;
    }
  }
  return appearance;
}

function buildAvatarPrompt(name: string, role: string, personality: string | undefined, stylePrompt: string): string {
  return `Portrait of ${buildAppearance(name, role, personality)}.\n\n${stylePrompt}${FRAMING_REQUIREMENT}`;
}
