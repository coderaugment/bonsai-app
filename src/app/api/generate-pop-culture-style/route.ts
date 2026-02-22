import { NextResponse } from "next/server";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Pop Culture References (ONE per prompt) ──────────────────────────────

const ANIMATION_STUDIOS = [
  "Pixar",
  "DreamWorks Animation",
  "Studio Ghibli",
  "Laika Studios",
  "Aardman Animations",
  "Blue Sky Studios",
  "Illumination Entertainment",
];

const ANIMATED_FILMS = [
  "Toy Story",
  "Shrek",
  "Spirited Away",
  "Coraline",
  "Wallace & Gromit",
  "Ice Age",
  "Despicable Me",
  "How to Train Your Dragon",
  "Kubo and the Two Strings",
  "The Incredibles",
  "Ratatouille",
  "WALL-E",
  "Up",
  "Inside Out",
  "Coco",
  "Soul",
  "Turning Red",
];

const LIVE_ACTION_FILMS = [
  "Blade Runner 2049",
  "Mad Max: Fury Road",
  "The Grand Budapest Hotel",
  "Moonrise Kingdom",
  "Drive",
  "The Matrix",
  "Sin City",
  "300",
  "Kill Bill",
  "Amélie",
  "Hero (Zhang Yimou)",
  "The Fall",
  "Speed Racer",
  "Scott Pilgrim vs. the World",
];

const TV_SHOWS = [
  "Arcane",
  "Love Death + Robots",
  "Spider-Verse",
  "Castlevania",
  "Cyberpunk: Edgerunners",
  "The Legend of Vox Machina",
  "Invincible",
  "Blue Eye Samurai",
];

const VIDEO_GAMES = [
  "Borderlands",
  "Fortnite",
  "Overwatch",
  "League of Legends",
  "Valorant",
  "Apex Legends",
  "Team Fortress 2",
  "Cyberpunk 2077",
  "Bioshock",
  "Dishonored",
  "Mirror's Edge",
  "Jet Set Radio",
  "Splatoon",
  "Hi-Fi Rush",
];

const COMIC_STYLES = [
  "Marvel Comics",
  "DC Comics",
  "Image Comics",
  "Dark Horse Comics",
  "French bande dessinée",
  "Japanese manga",
  "American newspaper comics",
  "Underground comix",
  "European graphic novels",
];

const ARTISTS = [
  "Moebius",
  "Jamie Hewlett",
  "Akira Toriyama",
  "Hayao Miyazaki",
  "Jack Kirby",
  "Frank Miller",
  "Mike Mignola",
  "Bruce Timm",
  "Glen Keane",
  "Mary Blair",
  "Eyvind Earle",
  "Genndy Tartakovsky",
];

// ── Cyberpunk Subcategories ──────────────────────────────────────────────

const CYBERPUNK_VARIANTS = [
  "Cyberpunk 2077",
  "Shadowrun",
  "Neuromancer",
  "Ghost in the Shell",
  "Akira",
  "Blade Runner",
  "Blade Runner 2049",
  "The Matrix",
  "Deus Ex",
  "System Shock",
  "Remember Me",
  "Cloudpunk",
];

const STEAMPUNK_VARIANTS = [
  "Bioshock Infinite",
  "Dishonored",
  "The League of Extraordinary Gentlemen",
  "Mortal Engines",
  "Treasure Planet",
  "Castle in the Sky",
  "Fullmetal Alchemist",
  "Arcanum",
];

const OTHER_PUNK_VARIANTS = [
  "Solarpunk",
  "Dieselpunk",
  "Atompunk",
  "Biopunk",
  "Cassette Futurism",
];

// ── Build Pop Culture Prompt (ONE reference only) ────────────────────────

function buildPopCulturePrompt(): string {
  const constraints = "Bust portrait, head and shoulders only, face fills most of the frame. No full body. Square format, no text or logos.";

  // Pick ONE category and ONE reference from that category
  const categories = [
    { name: "animation_studio", refs: ANIMATION_STUDIOS },
    { name: "animated_film", refs: ANIMATED_FILMS },
    { name: "live_action_film", refs: LIVE_ACTION_FILMS },
    { name: "tv_show", refs: TV_SHOWS },
    { name: "video_game", refs: VIDEO_GAMES },
    { name: "comic_style", refs: COMIC_STYLES },
    { name: "artist", refs: ARTISTS },
    { name: "cyberpunk", refs: CYBERPUNK_VARIANTS },
    { name: "steampunk", refs: STEAMPUNK_VARIANTS },
    { name: "other_punk", refs: OTHER_PUNK_VARIANTS },
  ];

  const category = pick(categories);
  const reference = pick(category.refs);

  // Build the style description based on category
  let styleDescription = "";

  switch (category.name) {
    case "animation_studio":
    case "animated_film":
      styleDescription = `${reference} style.`;
      break;
    case "live_action_film":
    case "tv_show":
      styleDescription = `${reference} aesthetic.`;
      break;
    case "video_game":
      styleDescription = `${reference} game art style.`;
      break;
    case "comic_style":
      styleDescription = `${reference} style.`;
      break;
    case "artist":
      styleDescription = `In the style of ${reference}.`;
      break;
    case "cyberpunk":
    case "steampunk":
    case "other_punk":
      styleDescription = `${reference} style.`;
      break;
  }

  return `${constraints} ${styleDescription}`;
}

// ── Cartoon-specific prompts (simple, not mixing styles) ─────────────────
// Classic cartoon styles only

const CARTOON_STYLES = [
  "Disney animation style",
  "Pixar animation style",
  "Looney Tunes style",
  "Animaniacs style",
  "Who Framed Roger Rabbit style",
  "Jessica Rabbit style",
];

function buildCartoonPrompt(): string {
  const constraints = "Bust portrait, head and shoulders only, face fills most of the frame. No full body. Square format, no text or logos.";
  const style = pick(CARTOON_STYLES);
  return `${constraints} ${style}.`;
}

// ── API Route ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type } = body; // "pop_culture" | "cartoon" | "cyberpunk"

    let style = "";

    if (type === "cartoon") {
      style = buildCartoonPrompt();
    } else if (type === "cyberpunk") {
      // Force cyberpunk/steampunk variants only
      const variants = [...CYBERPUNK_VARIANTS, ...STEAMPUNK_VARIANTS];
      const reference = pick(variants);
      style = `Bust portrait, head and shoulders only, face fills most of the frame. No full body. Square format, no text or logos. ${reference} style.`;
    } else {
      // Default: pop culture (all categories)
      style = buildPopCulturePrompt();
    }

    return NextResponse.json({ style });
  } catch (err) {
    console.error("[generate-pop-culture-style] failed:", err);
    return NextResponse.json({ error: "Style generation failed" }, { status: 500 });
  }
}
