import { NextResponse } from "next/server";
import type { WorkerRole } from "@/types";
import { workerRoles } from "@/lib/worker-types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export async function POST(req: Request) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json({ error: "GEMINI_API_KEY not configured" }, { status: 500 });
  }

  // name + gender provided by user, field: "all" (default), "appearance", "style"
  const { role, field, name, gender } = await req.json();
  if (!role) {
    return NextResponse.json({ error: "Role is required" }, { status: 400 });
  }

  const config = workerRoles[role as WorkerRole] || { label: role.replace(/_/g, " ") };
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  const g = gender || "male";
  const age = pick([
    "early 20s", "mid 20s", "late 20s", "early 30s", "mid 30s", "late 30s",
    "early 40s", "mid 40s", "late 40s", "early 50s", "late 50s", "60s",
  ]);
  const hair = pick([
    // Short
    "short cropped", "buzzcut", "high and tight military cut", "tight fade with sharp line-up",
    "crew cut", "cropped with hard part", "clean shaven head", "bald",
    // Medium
    "messy bedhead", "thick and tousled", "slicked back", "pompadour",
    "tapered natural", "textured quiff", "curtain bangs", "wolf cut",
    // Long
    "long flowing", "shoulder-length wavy", "shaggy 70s rocker mane like Robert Plant",
    "big wild curly hair like Slash", "waist-length straight", "long and windswept",
    // Curly/textured
    "curly", "tight coils", "voluminous afro", "wild untamed curls", "loose ringlets",
    "big voluminous blowout",
    // Braids/locs
    "long dreadlocs like Lenny Kravitz", "short locs", "thick box braids",
    "cornrows", "fishtail braid", "dutch braids", "twist-outs",
    // Styled/edgy
    "mohawk", "faux hawk", "liberty spikes", "undercut with long top",
    "half-shaved asymmetrical", "silver fox distinguished gray",
    "bleached platinum", "pixie cut", "finger waves",
  ]);
  const build = pick([
    "stocky", "tall and lanky", "broad-shouldered", "petite", "heavyset", "athletic",
    "average build", "wiry", "compact and muscular", "round-faced and sturdy",
    "imposingly tall", "barrel-chested", "lean and angular", "short and solid",
    "long-limbed and graceful", "thick-necked and powerful", "slight but intense",
  ]);
  const accessory = pick([
    "", "", "", // some chance of no accessory
    "wearing a beanie", "wearing a wide-brim fedora", "wearing a baseball cap backwards",
    "wearing a bandana", "wearing aviator sunglasses", "wearing round John Lennon glasses",
    "with visible tattoo sleeves", "with a prominent facial scar",
    "wearing chunky over-ear headphones", "wearing a flat cap", "with a nose ring",
    "wearing dog tags", "with a gold chain", "wearing thick-rimmed glasses",
    "with a toothpick in mouth", "wearing a newsboy cap", "with an eyepatch",
    "wearing a cowboy hat", "with a lip piercing", "wearing a bucket hat",
    "with multiple ear piercings", "wearing a beret", "with a braided beard",
    "wearing fingerless gloves", "with a neck tattoo", "wearing a snapback",
    "with reading glasses perched on nose", "wearing a trucker hat",
    "with a shaved eyebrow slit", "wearing a fur-lined hood",
    "with a handlebar mustache", "wearing colorful wrist bangles",
  ]);
  const clothingStyle = pick([
    "streetwear", "minimalist", "vintage thrift store", "athletic",
    "punk with patches and pins", "preppy", "bohemian", "raw denim and workwear",
    "techwear with utility straps", "classic professional", "grunge flannel and ripped jeans",
    "leather and denim biker", "military surplus", "retro 70s with wide collars",
    "sharp tailored suits", "cyberpunk with neon accents", "outdoorsy layers",
    "hip-hop streetwear", "goth", "skater with vans and graphic tees",
    "western with turquoise jewelry", "academic tweed and elbow patches",
    "tropical shirts unbuttoned", "all-black everything", "nautical with striped knits",
    "90s baggy with chain wallet", "new wave with bright colors",
    "lumberjack flannel and boots", "rockabilly with rolled cuffs",
    "dystopian utilitarian", "maximalist clashing patterns",
  ]);
  const commStyle = pick([
    "direct and blunt", "warm and encouraging", "dry and witty",
    "casual and laid-back", "precise and methodical", "energetic and enthusiastic",
    "sardonic with a sharp tongue", "quiet but devastatingly insightful",
    "fast-talking and charismatic", "deadpan and understated",
    "passionate and verbose", "measured and diplomatic",
    "cheerfully sarcastic", "terse and no-nonsense",
    "thoughtful with long pauses", "irreverent but brilliant",
  ]);

  const rerollField = field || "all";
  let prompt: string;

  if (rerollField === "appearance") {
    prompt = `Generate a visual description for a ${g} ${config.label.toLowerCase()} on a software team.
Traits: ${age}, ${build}, ${hair} hair, ${clothingStyle} clothing${accessory ? ", " + accessory : ""}.
Appearance: 1-2 sentences describing what they look like. Do NOT use any name — describe them in third person (e.g. "A stocky developer in his 30s..."). Include ALL the traits above. This drives their avatar image. Do NOT use the word "lean".
Return ONLY valid JSON: {"appearance": "..."}`;
  } else if (rerollField === "style") {
    prompt = `Write a 1-2 sentence communication style for a ${config.label.toLowerCase()} on a software team. They are ${commStyle}. They are a competent professional, not a joke character. Do NOT use any name — describe the style generically.
Return ONLY valid JSON: {"style": "..."}`;
  } else {
    const hasName = name && name.trim();
    prompt = `Generate a ${g} ${config.label.toLowerCase()} character for a software team${hasName ? ` named ${name}` : ""}.

REQUIRED TRAITS (use these exactly):
- Gender: ${g}
- Age: ${age}
- Build: ${build}
- Hair: ${hair}
- Clothing style: ${clothingStyle}${accessory ? "\n- Accessory: " + accessory : ""}
- Communication: ${commStyle}
${hasName ? "" : "\nName: Generate a single first name. Mix it up — sometimes use a totally normal everyday name (Mike, Sarah, Dave, Priya, Tom, Lisa, Kevin, Jenny, Matt, Kate, Rob, Amy, Dan, Rachel), sometimes something more distinctive. Lean toward normal names more often than exotic ones. Avoid fantasy/sci-fi names like Zephyr, Orion, Phoenix, Nova.\n"}
Appearance: 1-2 sentences incorporating ALL the traits above. Do NOT use any name — describe them in third person (e.g. "A tall developer in her 30s..."). Add accessories or distinguishing features. Do NOT use the word "lean". This drives their avatar image.

Style: 1-2 sentences about their ${commStyle} communication style in work chat. They are a competent professional, not a joke character. Do NOT reference the name in the style — keep it generic.

Return ONLY valid JSON:
{${hasName ? "" : '"name": "...", '}"appearance": "...", "style": "..."}`;
  }

  try {
    const res = await fetch(`${ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 1.0,
        },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini API error:", err);
      return NextResponse.json({ error: "Gemini API error" }, { status: 502 });
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    const parsed = JSON.parse(text);
    const result: Record<string, unknown> = { success: true };
    if (parsed.name) result.name = parsed.name;
    if (parsed.appearance) result.appearance = parsed.appearance;
    if (parsed.style) result.style = parsed.style;
    // For backwards compat: combined personality field
    if (parsed.appearance || parsed.style) {
      result.personality = [parsed.appearance, parsed.style].filter(Boolean).join("\n\n");
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("Worker generation failed:", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
