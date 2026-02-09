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
  const { role, field, name, gender, existingNames } = await req.json();
  const takenNames: string[] = Array.isArray(existingNames) ? existingNames : [];
  if (!role) {
    return NextResponse.json({ error: "Role is required" }, { status: 400 });
  }

  const config = workerRoles[role as WorkerRole] || { label: role.replace(/_/g, " ") };
  const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  const g = gender || "male";
  const age = pick([
    "early 20s", "mid 20s", "late 20s", "early 30s", "mid 30s", "late 30s",
    "early 40s", "mid 40s", "late 40s", "early 50s", "mid 50s", "late 50s",
    "early 60s", "mid 60s", "around 70",
  ]);
  const ethnicity = pick([
    "East Asian", "South Asian", "Southeast Asian", "Middle Eastern", "North African",
    "West African", "East African", "Southern African", "Nordic Scandinavian",
    "Mediterranean", "Eastern European", "Western European", "Irish",
    "Latino/Hispanic", "Indigenous American", "Pacific Islander", "Caribbean",
    "Central Asian", "Korean", "Japanese", "Chinese", "Filipino", "Vietnamese",
    "Thai", "Indian", "Pakistani", "Bengali", "Persian", "Turkish", "Arab",
    "Ethiopian", "Nigerian", "Ghanaian", "Kenyan", "Somali", "South African",
    "Brazilian", "Mexican", "Colombian", "Peruvian", "Cuban", "Puerto Rican",
    "Jamaican", "Haitian", "Trinidadian", "Russian", "Polish", "Ukrainian",
    "Greek", "Italian", "Spanish", "Portuguese", "French", "German", "British",
    "Scottish", "Welsh", "Scandinavian", "Finnish", "Icelandic", "Dutch",
    "Australian Aboriginal", "Maori", "Samoan", "Hawaiian", "Mongolian",
    "Tibetan", "Nepalese", "Sri Lankan", "Afghani", "Kurdish", "Armenian",
    "Georgian", "Uzbek", "Kazakh", "mixed heritage", "mixed race",
  ]);
  const hair = pick([
    // Short
    "short cropped", "buzzcut", "high and tight military cut", "tight fade with sharp line-up",
    "crew cut", "cropped with hard part", "clean shaven head", "bald",
    "skin fade with textured top", "caesar cut", "temple fade",
    "low taper fade", "mid fade with sponge curls", "edgar cut",
    // Medium
    "messy bedhead", "thick and tousled", "slicked back", "pompadour",
    "tapered natural", "textured quiff", "curtain bangs", "wolf cut",
    "middle part with feathered layers", "shag cut", "mullet",
    "business casual side part", "french crop", "ivy league cut",
    "textured fringe", "choppy layers", "disconnected undercut",
    // Long
    "long flowing", "shoulder-length wavy", "shaggy 70s rocker mane",
    "big wild curly hair", "waist-length straight", "long and windswept",
    "hip-length braided ponytail", "long layered with face framing",
    "mermaid waves", "long pin-straight jet black", "rapunzel-length golden",
    // Curly/textured
    "curly", "tight coils", "voluminous afro", "wild untamed curls", "loose ringlets",
    "big voluminous blowout", "soft S-waves", "tight spiral curls",
    "fluffy cloud-like curls", "3c ringlet curls", "4c coils",
    "beachy textured waves", "perm curls", "jheri curl",
    // Braids/locs
    "long dreadlocs", "short locs", "thick box braids",
    "cornrows", "fishtail braid", "dutch braids", "twist-outs",
    "freeform locs", "sister locs", "passion twists", "knotless braids",
    "fulani braids with beads", "stitch braids", "crochet braids",
    "bantu knots", "flat twists", "goddess locs",
    // Styled/edgy
    "mohawk", "faux hawk", "liberty spikes", "undercut with long top",
    "half-shaved asymmetrical", "silver fox distinguished gray",
    "bleached platinum", "pixie cut", "finger waves",
    "bright red dyed", "split dye (half black half bleached)", "pastel pink",
    "deep purple", "electric blue streaks", "frosted tips",
    "ombre from dark roots to blonde ends", "stark white",
    "salt and pepper distinguished", "copper red", "jet black with gray temples",
    "honey blonde", "strawberry blonde", "chestnut brown",
    // Cultural/traditional
    "top knot samurai style", "man bun", "slicked back with gel shine",
    "feathered 80s blowout", "pin curls vintage style", "victory rolls",
    "space buns", "high puff", "tapered TWA (teeny weeny afro)",
  ]);
  const build = pick([
    "stocky", "tall and lanky", "broad-shouldered", "petite", "heavyset", "athletic",
    "average build", "wiry", "compact and muscular", "round-faced and sturdy",
    "imposingly tall", "barrel-chested", "lean and angular", "short and solid",
    "long-limbed and graceful", "thick-necked and powerful", "slight but intense",
    "curvy and confident", "rail-thin and bony", "soft and round",
    "swimmers build with wide shoulders", "powerlifter thick",
    "tall and willowy", "short and scrappy", "medium height and unremarkable",
    "pear-shaped and comfortable", "broad-hipped and strong",
    "narrow-shouldered but tall", "tiny and fierce", "bear-like and warm",
    "dancer's build — toned and precise", "dad bod", "linebacker massive",
    "rangy and loose-jointed", "squat and immovable", "gangly with big hands",
    "compact and dense like a wrestler", "naturally thin metabolism",
    "thick-armed and sturdy", "delicate-boned and elegant",
  ]);
  const facialFeaturesCommon = [
    "", "", // some chance of none
    "with a strong jawline", "with high cheekbones", "with deep-set eyes",
    "with a crooked nose from an old break", "with prominent dimples",
    "with a gap between their front teeth", "with heavy-lidded sleepy eyes",
    "with a wide easy smile", "with sharp hawk-like features",
    "with a round baby face", "with weathered sun-worn skin",
    "with a dusting of freckles", "with a beauty mark near the lip",
    "with laugh lines around bright eyes", "with a cleft chin",
    "with dark circles under intense eyes", "with a thin scar across the brow",
    "with a broad flat nose", "with full expressive lips",
    "with narrow fox-like eyes", "with thick bushy eyebrows",
    "with smooth clean-shaven skin",
    "with crow's feet from years of squinting", "with a sun-faded tan line",
    "with vitiligo patches", "with acne scars on the cheeks",
    "with a mole on the cheek", "with a double chin",
    "with an angular aquiline nose", "with soft rounded features",
    "with a resting serious expression", "with naturally upturned smiling lips",
  ];
  const facialHairMale = [
    "with a permanent five o'clock shadow", "with a neatly trimmed beard",
    "with a long full beard", "with a goatee", "with a pencil mustache",
    "with a thick walrus mustache", "with mutton chops",
    "with a patchy attempt at facial hair", "with a braided viking beard",
    "with a handlebar mustache", "with a soul patch",
    "with a chin strap beard", "with designer stubble",
  ];
  const facialFeature = pick(
    g === "male" ? [...facialFeaturesCommon, ...facialHairMale] : facialFeaturesCommon
  );
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
    "wearing safety glasses pushed up on forehead", "with a septum ring",
    "wearing a keffiyeh scarf", "with a single dangly earring",
    "wearing cat-eye glasses", "wearing tortoiseshell glasses",
    "with a gold tooth", "wearing a turban", "wearing a hijab",
    "with a dermal piercing", "wearing a pocket watch chain",
    "with a tribal face tattoo", "wearing a surgical mask pulled down",
    "with a pencil behind the ear", "wearing noise-canceling earbuds",
    "with a bluetooth earpiece", "wearing a lanyard with badges",
    "with a prominent adam's apple", "wearing a silk scarf",
    "with a cigar (unlit) tucked in pocket", "wearing mirrored sunglasses",
    "with a medic alert bracelet", "wearing a religious pendant",
    "with a flower tucked behind the ear", "wearing wire-rimmed glasses",
    "with industrial ear piercings", "wearing a sweatband",
    "with a geometric undercut design", "wearing a choker necklace",
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
    "cottagecore soft knits and earth tones", "dark academia layers",
    "Y2K low-rise and metallics", "normcore plain basics",
    "gorpcore outdoor technical wear", "old money quiet luxury",
    "harajuku layered and colorful", "afrofuturism bold prints",
    "mod 60s sharp and clean", "new romantic frills and drama",
    "avant-garde deconstructed fashion", "cottagecore overalls and florals",
    "hip-hop oversized jerseys and sneakers", "emo black skinny jeans and band tees",
    "indie folk corduroy and vintage denim", "sporty athleisure",
    "coastal grandmother linen and pearls", "barbiecore hot pink everything",
    "scandinavian clean lines and muted tones", "industrial workwear with steel toes",
    "art teacher paint-stained smock vibes", "silicon valley hoodie and jeans",
    "safari khaki with lots of pockets", "festival boho with fringe",
    "miami vice pastels with rolled sleeves", "korean street fashion layered",
    "japanese workwear with indigo dye", "parisian effortlessly chic",
    "brooklyn hipster with curated vintage", "texas ranch hand denim and boots",
    "pacific northwest flannel and fleece", "SoHo gallery all-black conceptual",
    "gym rat compression everything", "dad style polo tucked into khakis",
    "librarian cozy cardigans and glasses", "chef coat and kitchen clogs",
  ]);
  const commStyle = pick([
    "direct and blunt", "warm and encouraging", "dry and witty",
    "casual and laid-back", "precise and methodical", "energetic and enthusiastic",
    "sardonic with a sharp tongue", "quiet but devastatingly insightful",
    "fast-talking and charismatic", "deadpan and understated",
    "passionate and verbose", "measured and diplomatic",
    "cheerfully sarcastic", "terse and no-nonsense",
    "thoughtful with long pauses", "irreverent but brilliant",
    "nervously fast with lots of qualifiers", "calm and steady like a therapist",
    "excitable and tangent-prone", "stoic and monosyllabic until engaged",
    "self-deprecating but sharp", "mentorly and patient",
    "conspiratorial like sharing secrets", "professorial with tangents",
    "gruff exterior hiding genuine care", "bubbly and relentlessly positive",
    "laconic — says more with less", "intense and focused like a laser",
    "folksy with metaphors and stories", "clinical and precise like a surgeon",
    "playfully competitive", "gently probing with Socratic questions",
    "rapid-fire stream of consciousness", "quietly confident and reassuring",
    "skeptical and always questioning assumptions", "mischievous with a twinkle",
    "empathetic and deeply curious about people", "matter-of-fact with dry humor underneath",
    "animated with big gestures and expressions", "soft-spoken but commands attention",
    "provocative — loves playing devil's advocate", "concise to the point of being cryptic",
    "nurturing and protective of the team", "wry and observational",
    "bold and unapologetic", "pensive and philosophical",
  ]);

  const rerollField = field || "all";
  let prompt: string;

  if (rerollField === "appearance") {
    prompt = `Generate a visual description for a ${g} ${ethnicity} ${config.label.toLowerCase()} on a software team.
Traits: ${age}, ${build}, ${hair} hair, ${clothingStyle} clothing${facialFeature ? ", " + facialFeature : ""}${accessory ? ", " + accessory : ""}.
Appearance: 1-2 sentences describing what they look like. Do NOT use any name — describe them in third person (e.g. "A stocky developer in his 30s..."). Include ALL the traits above. This drives their avatar image. Do NOT use the word "lean".
Return ONLY valid JSON: {"appearance": "..."}`;
  } else if (rerollField === "style") {
    prompt = `Write a 1-2 sentence communication style for a ${config.label.toLowerCase()} on a software team. They are ${commStyle}. They are a competent professional, not a joke character. Do NOT use any name — describe the style generically.
Return ONLY valid JSON: {"style": "..."}`;
  } else {
    const hasName = name && name.trim();
    prompt = `Generate a ${g} ${ethnicity} ${config.label.toLowerCase()} character for a software team${hasName ? ` named ${name}` : ""}.

REQUIRED TRAITS (use these exactly):
- Gender: ${g}
- Ethnicity: ${ethnicity}
- Age: ${age}
- Build: ${build}
- Hair: ${hair}
- Clothing style: ${clothingStyle}${facialFeature ? "\n- Face: " + facialFeature : ""}${accessory ? "\n- Accessory: " + accessory : ""}
- Communication: ${commStyle}
${hasName ? "" : `\nName: Generate a single first name. Mix it up — sometimes use a totally normal everyday name (Mike, Sarah, Dave, Priya, Tom, Lisa, Kevin, Jenny, Matt, Kate, Rob, Amy, Dan, Rachel), sometimes something more distinctive. Lean toward normal names more often than exotic ones. Avoid fantasy/sci-fi names like Zephyr, Orion, Phoenix, Nova.${takenNames.length > 0 ? ` IMPORTANT: Do NOT use any of these already-taken names: ${takenNames.join(", ")}. Pick something completely different.` : ""}\n`}
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
