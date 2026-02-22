import { NextResponse } from "next/server";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = arr.slice().sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// ── Dimension arrays ─────────────────────────────────────────────────────────

const MEDIUMS = [
  "encaustic wax on wooden panel", "egg tempera on gessoed board", "gouache on toned illustration board",
  "silverpoint on bone-white prepared ground", "fresco on wet plaster", "sumi ink on kozo mulberry paper",
  "dry pastel on velvet", "compressed charcoal and white chalk on toned paper", "wax crayon on black card",
  "pen-and-ink crosshatch", "fine nib dip pen in iron gall", "linocut reduction print",
  "mezzotint on copper plate", "aquatint etching on zinc plate", "drypoint on perspex",
  "risograph 3-color offset print", "letterpress on cotton rag paper", "woodblock on washi",
  "cyanotype photographic print", "platinum-palladium contact print", "expired slide film photograph",
  "polaroid instant film", "lomography wide-angle film", "photogram on darkroom paper",
  "collage of cut magazine newsprint", "photomontage darkroom composite", "stencil spray on concrete",
  "cloisonné enamel on copper", "niello inlay on silver plate", "lacquerware urushi on wood",
  "batik wax-resist on cotton", "shibori indigo dye on silk", "counted cross-stitch on linen",
  "crewelwork embroidery on linen twill", "reverse glass painting (églomisé)", "scrimshaw on whale ivory",
  "pyrography burn on birch panel", "scratchboard with engraving tool on clay-coated board",
  "monotype oil ink pulled from glass plate", "acrylic paint knife impasto on raw canvas",
  "airbrush on acetate", "oil stick and wax on aluminum", "cold wax medium on panel",
  // digital + hybrid
  "digital painting on tablet with custom bristle brush textures",
  "3D render with subsurface scattering and displacement maps",
  "generative algorithm output plotter-drawn on archival cotton paper",
  "glitch art from intentionally corrupted bitmap data",
  "VHS signal distortion composite over digital photograph",
  "databent JPEG with intentional compression artifact blocks",
  "UV-reactive inkjet print on matte black paper",
  "holographic foil transfer on archival paper",
  "laser-etched acrylic panel backlit with LEDs",
  "CGI matte painting with photorealistic raytraced rendering",
  "8-bit pixel art on simulated CRT phosphor screen",
  "thermal imaging false-color digital print",
  "long-exposure neon light photography",
  "photogrammetry point-cloud portrait, rendered and printed",
  "vector illustration with flat fills and geometric gradients",
  "deepfake composite — photograph layered with latent space interpolation",
  "ASCII art printed monospaced on thermal receipt paper",
  "satellite imagery recolored and composited with portrait layer",
];

const MOVEMENTS = [
  "Baroque tenebrism", "Dutch Golden Age realism", "Flemish Renaissance glazing", "Rococo pastel elegance",
  "Neoclassical severity", "Romanticism sublime drama", "Pre-Raphaelite jewelled detail",
  "Symbolist dreamlike iridescence", "Art Nouveau organic flow", "Fauvism raw chromatic intensity",
  "Cubist simultaneous fragmentation", "Italian Futurism dynamic decomposition",
  "Dada anti-art provocateur", "Surrealist uncanny displacement", "De Stijl neoplastic geometry",
  "Suprematist pure form", "Constructivist diagonal dynamism", "Bauhaus functional clarity",
  "German Expressionism angst", "Neue Sachlichkeit clinical hyper-detail", "Art Deco gilded geometry",
  "Abstract Expressionist gesture", "Color Field flat chromatic field", "Hard-edge geometric precision",
  "Op Art optical vibration", "Neo-Expressionist raw rawness", "Memphis postmodern pattern",
  "Lowbrow Kustom Kulture hot-rod", "Brutalist confrontational minimalism", "Digital glitch corrupted data",
  // genre aesthetics
  "cyberpunk neon-noir megacity grime", "steampunk Victorian brass-and-gear industrial",
  "solarpunk organic utopian overgrowth", "dieselpunk 1940s retrofuturist machine-age",
  "biopunk wet organic visceral mutant", "vaporwave pastel retro-digital nostalgia",
  "dark academia candlelit manuscript obsession", "atompunk Googie 1950s space-race optimism",
  "afrofuturist cosmic mythological tech", "cassette futurism analog synth-era retro",
  "cottagecore pastoral folk warmth", "witchcore occult botanical darkness",
];

const CULTURES = [
  "Safavid Persian court", "Mughal Akbari miniature", "Rajput Hindu devotional", "Tibetan Buddhist thangka",
  "Chinese Northern Song literati", "Japanese Edo period", "Korean Joseon muninhwa",
  "Ottoman imperial workshop", "Byzantine Constantinople", "Coptic Christian Egypt",
  "Ethiopian Gondarene sacred", "West African Yoruba", "Haitian Vodou flag (drapo)",
  "Mexican Huichol yarn painting", "Mexican ex-voto retablo on tin", "Aztec screenfold codex",
  "Mayan stucco relief", "Peruvian Shipibo geometric", "Aboriginal Australian sacred site",
  "Pacific Northwest Coast Haida formline", "Inuit Arctic coastal", "Scandinavian Sami folk",
  "Norwegian rosemaling", "Eastern European reverse-glass icon", "Russian lubok folk woodblock",
  "Indonesian wayang kulit shadow puppet", "Javanese batik court", "Thai Rattanakosin mural",
  "Dunhuang Cave Buddhist fresco", "Hellenistic Greek encaustic", "Ancient Egyptian faience",
];

const PALETTES = [
  "iron oxide red, raw umber, lead white — Roman earth palette",
  "lapis lazuli, vermillion, gold leaf — medieval mineral pigments",
  "prussian blue, chrome yellow, ivory black — 18th century oil palette",
  "malachite green, azurite blue, red lead, burnished gold",
  "indigo resist and turmeric yellow on natural cotton ground",
  "acid neon green, hot magenta, electric cyan on black",
  "viridian, cadmium orange, titanium white — pure complementary clash",
  "ochre, sienna, burnt umber, chalk white — pure earth",
  "deep prussian blue dominant with single vermillion accent",
  "prussian blue and white only — cyanotype monochrome",
  "warm sepia through cool graphite — platinum print range",
  "three spot colors: coral, teal, mustard — risograph palette",
  "Soviet red, black, cream — propaganda restricted palette",
  "fluorescent risograph ink: fluo pink overprinted on process blue",
  "muted Zorn palette: ivory black, yellow ochre, vermillion, white",
  "jewel tones: ruby, sapphire, emerald — stained glass spectrum",
  "desaturated muted sage, dusty rose, bone — faded fresco",
  "phosphorescent green-yellow against absolute black",
  "silver and black only — niello on polished metal",
  "candy-flake metallics: gold, silver, pearl, interference violet",
];

const FEELS = [
  "haunted and melancholic, a painted memento mori",
  "ecstatic spiritual radiance, sacred inner light",
  "cold clinical detachment, the subject stares without sentiment",
  "tender intimacy, a private moment arrested in time",
  "brutal confrontational rawness, nothing is flattered",
  "dreamlike uncanny displacement, reality slightly wrong",
  "heroic proletarian dignity, monumental and earnest",
  "decadent opulence, every surface encrusted with ornament",
  "feverish psychological intensity, diagnostic and unsettling",
  "serene timeless stillness, breath held for centuries",
  "carnivalesque grotesque humor, baroque excess at full volume",
  "austere mathematical beauty, emotion sublimated into geometry",
  "folk art naivety with profound encoded symbolic meaning",
  "industrial machine-age optimism, the human as dynamic force",
  "corrupt digital decay, beauty in the broken signal",
  "ancient archaic gravity, a face from before recorded history",
  "sumptuous courtly magnificence, power displayed through textile",
  "raw outsider urgency, untrained hand making direct marks",
  "poetic wabi-sabi imperfection, the crack is the beauty",
  "erotic symbolist decadence, fin-de-siècle fever dream",
];

const CONCEPTS = [
  "the sitter's inner state made visible in the mark-making",
  "time and decay written into the surface material",
  "cultural hybridity — two visual traditions colliding",
  "the face as sacred object, icon, and artifact",
  "memory degrading into abstraction at the edges",
  "the violence of reducing a person to a flat image",
  "craft as devotional act — patience made visible",
  "the propaganda machine turning flesh into symbol",
  "the document as art — truth and artifice indistinguishable",
  "negative space as active as the positive form",
  "the gaze returned — subject watching the viewer watching",
  "the surface texture as emotional register",
  "pigment and ground as equally expressive elements",
  "the portrait as cultural artifact and historical document",
];

const ARTISTS = [
  "Rembrandt van Rijn", "Francisco Goya", "Albrecht Dürer", "Artemisia Gentileschi",
  "Katsushika Hokusai", "Utagawa Hiroshige", "Qi Baishi", "Kim Hongdo",
  "Caravaggio", "Velázquez", "Jan van Eyck", "Hans Holbein the Younger",
  "Egon Schiele", "Ernst Ludwig Kirchner", "Käthe Kollwitz", "Otto Dix",
  "Gustav Klimt", "Alphonse Mucha", "Aubrey Beardsley",
  "El Lissitzky", "Alexander Rodchenko", "Hannah Höch", "John Heartfield",
  "Jean-Michel Basquiat", "Francis Bacon", "Lucian Freud", "Georg Baselitz",
  "David Hockney", "R. Crumb", "Moebius (Jean Giraud)", "Dave McKean",
  "Malika Favre", "Tadanori Yokoo", "Walton Ford", "Kara Walker",
  "Wifredo Lam", "Ibrahim El-Salahi", "Frida Kahlo", "Tarsila do Amaral",
  "Remedios Varo", "Leonora Carrington", "Yayoi Kusama", "Lee Ufan",
  "Man Ray", "László Moholy-Nagy", "El Anatsui", "Julie Mehretu",
];

const TECHNIQUES = [
  "built up in 30 successive transparent glazes, each dried before the next",
  "single continuous line — the face drawn without lifting the instrument",
  "knife-applied — no brush, all palette knife impasto slabs",
  "reverse painting on glass, applied from background to foreground",
  "wet-into-wet, colors bleeding and blooming uncontrolled",
  "pure hatch and cross-hatch — no wash, no fill, pure line density",
  "collaged torn paper edges building the face in overlapping planes",
  "resist technique — wax or gum masking areas before each color pass",
  "stamped geometric modules assembled into the face",
  "burnished gold leaf ground revealed by strategic scratching through paint",
  "photographic emulsion layered with hand-drawn marks",
  "thermal wax heated and fused — encaustic fire-and-scrape method",
  "salt-print chemistry showing the natural crystalline texture",
  "screen-filler drawn directly on mesh, hand-squeegeed ink",
  "dry brush dragged across rough paper leaving broken edges",
  "sgraffito — top layer scratched through to contrasting underlayer",
  "marbling — floating colors on water surface, paper dipped to capture",
  "solvent transfer — magazine image dissolved and re-deposited",
  "bleach reduction — working from dark to light by subtraction",
  "chine-collé — thin tissue collaged under intaglio printing pressure",
];

const FOCAL = [
  "eyes illuminated as the sole sharp focal point, all else dissolving",
  "extreme asymmetric composition — face pushed to one edge, negative space dominant",
  "cropped aggressively — forehead and chin both cut off, eyes centered",
  "the silhouette reads as strong graphic shape before detail registers",
  "face emerging from textural ground — materializing rather than posed",
  "decorative border framing the face",
  "flat-on frontal, the gaze direct and unmediated",
  "three-quarter view, strong shadow bisecting the face diagonally",
  "a single raking light source from extreme left, half face in shadow",
  "tightly cropped to the eyes and nose, forehead filling the top third",
  "deep background pattern pulling equal visual weight as the face",
  "soft vignetted edges, the face floating without ground",
];

// ── Linked genre aesthetics (movement + matching palette/medium/feel) ──────────
// When a genre is picked, all four dimensions are coherent instead of random.

interface GenreAesthetic {
  movement: string;
  palettes: string[];
  mediums: string[];
  feels: string[];
}

const GENRE_AESTHETICS: GenreAesthetic[] = [
  {
    movement: "cyberpunk neon-noir megacity grime",
    palettes: [
      "acid neon green, hot magenta, electric cyan on black",
      "phosphorescent green-yellow against absolute black",
      "deep prussian blue dominant with single vermillion accent",
    ],
    mediums: [
      "glitch art from intentionally corrupted bitmap data",
      "VHS signal distortion composite over digital photograph",
      "digital painting on tablet with custom bristle brush textures",
      "databent JPEG with intentional compression artifact blocks",
    ],
    feels: [
      "corrupt digital decay, beauty in the broken signal",
      "feverish psychological intensity, diagnostic and unsettling",
      "cold clinical detachment, the subject stares without sentiment",
    ],
  },
  {
    movement: "Tron-grid digital light-trail neon geometry",
    palettes: [
      "electric cyan and white circuit lines on absolute black — Tron grid",
      "deep indigo with white circuit-line traces and electric cyan glow",
      "neon blue, white, and black only — identity disc geometry",
    ],
    mediums: [
      "laser-etched acrylic panel backlit with LEDs",
      "vector illustration with flat fills and geometric gradients",
      "digital painting on tablet with custom bristle brush textures",
      "holographic foil transfer on archival paper",
    ],
    feels: [
      "austere mathematical beauty, emotion sublimated into geometry",
      "cold clinical detachment, the subject stares without sentiment",
      "heroic proletarian dignity, monumental and earnest",
    ],
  },
  {
    movement: "steampunk Victorian brass-and-gear industrial",
    palettes: [
      "prussian blue, chrome yellow, ivory black — 18th century oil palette",
      "warm sepia through cool graphite — platinum print range",
      "ochre, sienna, burnt umber, chalk white — pure earth",
    ],
    mediums: [
      "pen-and-ink crosshatch",
      "mezzotint on copper plate",
      "fine nib dip pen in iron gall",
      "aquatint etching on zinc plate",
      "drypoint on perspex",
    ],
    feels: [
      "industrial machine-age optimism, the human as dynamic force",
      "decadent opulence, every surface encrusted with ornament",
      "haunted and melancholic, a painted memento mori",
    ],
  },
  {
    movement: "vaporwave pastel retro-digital nostalgia",
    palettes: [
      "candy-flake metallics: gold, silver, pearl, interference violet",
      "fluorescent risograph ink: fluo pink overprinted on process blue",
      "three spot colors: coral, teal, mustard — risograph palette",
    ],
    mediums: [
      "digital painting on tablet with custom bristle brush textures",
      "VHS signal distortion composite over digital photograph",
      "risograph 3-color offset print",
      "deepfake composite — photograph layered with latent space interpolation",
    ],
    feels: [
      "dreamlike uncanny displacement, reality slightly wrong",
      "tender intimacy, a private moment arrested in time",
      "decadent opulence, every surface encrusted with ornament",
    ],
  },
  {
    movement: "biopunk wet organic visceral mutant",
    palettes: [
      "acid neon green, hot magenta, electric cyan on black",
      "viridian, cadmium orange, titanium white — pure complementary clash",
      "malachite green, azurite blue, red lead, burnished gold",
    ],
    mediums: [
      "3D render with subsurface scattering and displacement maps",
      "airbrush on acetate",
      "monotype oil ink pulled from glass plate",
    ],
    feels: [
      "feverish psychological intensity, diagnostic and unsettling",
      "brutal confrontational rawness, nothing is flattered",
      "dreamlike uncanny displacement, reality slightly wrong",
    ],
  },
  {
    movement: "solarpunk organic utopian overgrowth",
    palettes: [
      "viridian, cadmium orange, titanium white — pure complementary clash",
      "malachite green, azurite blue, red lead, burnished gold",
      "indigo resist and turmeric yellow on natural cotton ground",
    ],
    mediums: [
      "gouache on toned illustration board",
      "batik wax-resist on cotton",
      "woodblock on washi",
      "shibori indigo dye on silk",
    ],
    feels: [
      "ecstatic spiritual radiance, sacred inner light",
      "folk art naivety with profound encoded symbolic meaning",
      "serene timeless stillness, breath held for centuries",
    ],
  },
  {
    movement: "dieselpunk 1940s retrofuturist machine-age",
    palettes: [
      "Soviet red, black, cream — propaganda restricted palette",
      "prussian blue, chrome yellow, ivory black — 18th century oil palette",
      "warm sepia through cool graphite — platinum print range",
    ],
    mediums: [
      "risograph 3-color offset print",
      "letterpress on cotton rag paper",
      "airbrush on acetate",
      "linocut reduction print",
    ],
    feels: [
      "heroic proletarian dignity, monumental and earnest",
      "industrial machine-age optimism, the human as dynamic force",
      "brutal confrontational rawness, nothing is flattered",
    ],
  },
  {
    movement: "afrofuturist cosmic mythological tech",
    palettes: [
      "jewel tones: ruby, sapphire, emerald — stained glass spectrum",
      "candy-flake metallics: gold, silver, pearl, interference violet",
      "malachite green, azurite blue, red lead, burnished gold",
    ],
    mediums: [
      "digital painting on tablet with custom bristle brush textures",
      "collage of cut magazine newsprint",
      "cloisonné enamel on copper",
      "photomontage darkroom composite",
    ],
    feels: [
      "ecstatic spiritual radiance, sacred inner light",
      "heroic proletarian dignity, monumental and earnest",
      "sumptuous courtly magnificence, power displayed through textile",
    ],
  },
  {
    movement: "dark academia candlelit manuscript obsession",
    palettes: [
      "ochre, sienna, burnt umber, chalk white — pure earth",
      "warm sepia through cool graphite — platinum print range",
      "prussian blue and white only — cyanotype monochrome",
    ],
    mediums: [
      "fine nib dip pen in iron gall",
      "silverpoint on bone-white prepared ground",
      "scratchboard with engraving tool on clay-coated board",
      "pen-and-ink crosshatch",
    ],
    feels: [
      "haunted and melancholic, a painted memento mori",
      "serene timeless stillness, breath held for centuries",
      "feverish psychological intensity, diagnostic and unsettling",
    ],
  },
  {
    movement: "atompunk Googie 1950s space-race optimism",
    palettes: [
      "three spot colors: coral, teal, mustard — risograph palette",
      "acid neon green, hot magenta, electric cyan on black",
      "candy-flake metallics: gold, silver, pearl, interference violet",
    ],
    mediums: [
      "airbrush on acetate",
      "risograph 3-color offset print",
      "letterpress on cotton rag paper",
    ],
    feels: [
      "industrial machine-age optimism, the human as dynamic force",
      "ecstatic spiritual radiance, sacred inner light",
      "heroic proletarian dignity, monumental and earnest",
    ],
  },
  {
    movement: "cassette futurism analog synth-era retro",
    palettes: [
      "warm sepia through cool graphite — platinum print range",
      "three spot colors: coral, teal, mustard — risograph palette",
      "fluorescent risograph ink: fluo pink overprinted on process blue",
    ],
    mediums: [
      "VHS signal distortion composite over digital photograph",
      "digital painting on tablet with custom bristle brush textures",
      "airbrush on acetate",
      "photomontage darkroom composite",
    ],
    feels: [
      "dreamlike uncanny displacement, reality slightly wrong",
      "tender intimacy, a private moment arrested in time",
      "cold clinical detachment, the subject stares without sentiment",
    ],
  },
  {
    movement: "witchcore occult botanical darkness",
    palettes: [
      "deep prussian blue dominant with single vermillion accent",
      "silver and black only — niello on polished metal",
      "prussian blue and white only — cyanotype monochrome",
    ],
    mediums: [
      "cyanotype photographic print",
      "silverpoint on bone-white prepared ground",
      "woodblock on washi",
      "photogram on darkroom paper",
    ],
    feels: [
      "haunted and melancholic, a painted memento mori",
      "erotic symbolist decadence, fin-de-siècle fever dream",
      "dreamlike uncanny displacement, reality slightly wrong",
    ],
  },
];

// ── Assemble style prompt directly from ingredients ────────────────────────────

const CONNECTORS_CULTURE = [
  "filtered through", "inflected by", "in dialogue with", "steeped in",
  "drawing on", "fused with",
];

const CONNECTORS_ARTISTS = [
  "In the manner of", "After the workshop of", "Influenced by",
  "In the spirit of", "Channeling",
];

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function coin(p = 0.5): boolean {
  return Math.random() < p;
}

function buildStylePrompt(): string {
  // Portrait constraint goes FIRST — highest weight with image models
  const constraints = "Bust portrait, head and shoulders only, face fills most of the frame. No full body. Square format, no text or logos.";

  // 30% chance: use a linked genre aesthetic (coherent palette/medium/feel)
  // 70% chance: fully random cross-dimensional collision
  const genre = coin(0.30) ? pick(GENRE_AESTHETICS) : null;

  const medium   = genre ? pick(genre.mediums)  : pick(MEDIUMS);
  const movement = genre ? genre.movement        : pick(MOVEMENTS);
  const palette  = genre ? pick(genre.palettes)  : pick(PALETTES);
  const feel     = genre ? pick(genre.feels)     : pick(FEELS);

  // Build optional parts — randomly drop each to reduce noise and conflicts.
  // Never use all dimensions at once: target 4-6 total sentences.
  const parts: string[] = [];

  // Medium always included (the visual foundation)
  // Technique only 35% of the time — biggest source of medium conflicts
  if (coin(0.35)) {
    parts.push(`${cap(medium)}, ${pick(TECHNIQUES)}.`);
  } else {
    parts.push(`${cap(medium)}.`);
  }

  // Movement + optional cultural fusion (movement 90%, culture 55%)
  if (coin(0.55)) {
    parts.push(`${cap(movement)} sensibility ${pick(CONNECTORS_CULTURE)} ${pick(CULTURES)}.`);
  } else if (coin(0.90)) {
    parts.push(`${cap(movement)} sensibility.`);
  }

  // Palette (85%)
  if (coin(0.85)) {
    parts.push(`${cap(palette)}.`);
  }

  // Feel (75%)
  if (coin(0.75)) {
    parts.push(`${cap(feel)}.`);
  }

  // Concept (45%) — mood/thematic only, not structural
  if (coin(0.45)) {
    parts.push(`${cap(pick(CONCEPTS))}.`);
  }

  // Focal composition (65%)
  if (coin(0.65)) {
    parts.push(`${cap(pick(FOCAL))}.`);
  }

  // Artist reference (60%)
  if (coin(0.60)) {
    const artists = pickN(ARTISTS, 2);
    parts.push(`${pick(CONNECTORS_ARTISTS)} ${artists[0]} and ${artists[1]}.`);
  }

  return [constraints, ...parts].join(" ");
}

// ── Cartoon styles (classic cartoons only, ONE reference) ───────────────────

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
  const style = CARTOON_STYLES[Math.floor(Math.random() * CARTOON_STYLES.length)];
  return `${constraints} ${style}.`;
}

// ── Pop culture styles (ONE reference only) ──────────────────────────────────
// Specific movies, TV shows, games, comics, music artists - NOT aesthetic movements or generic styles

const POP_CULTURE_REFS = [
  // Movies
  "Kill Bill style",
  "Pulp Fiction style",
  "Blade Runner style",
  "The Matrix style",
  "Mad Max: Fury Road style",
  "Sin City style",
  "300 style",
  "Scott Pilgrim vs. the World style",
  "Drive style",
  "Tron style",
  "Reservoir Dogs style",
  "Django Unchained style",
  "Inglourious Basterds style",

  // TV Shows
  "iCarly style",
  "Breaking Bad style",
  "Stranger Things style",
  "The Mandalorian style",
  "Game of Thrones style",

  // Animation
  "Toy Story style",
  "Shrek style",
  "Spider-Verse style",
  "Arcane style",
  "Studio Ghibli style",
  "The Incredibles style",
  "Akira style",

  // Games
  "Fortnite style",
  "Borderlands style",
  "Overwatch style",
  "Cyberpunk 2077 style",
  "Bioshock style",
  "Team Fortress 2 style",

  // Comics & Superheroes
  "Superman comic style",
  "Marvel Comics style",
  "DC Comics style",
  "Batman comic style",
  "Spider-Man comic style",

  // Music Artists
  "Bad Bunny aesthetic",
  "Tyler, the Creator aesthetic",
  "Billie Eilish aesthetic",
];

function buildPopCulturePrompt(): string {
  const constraints = "Bust portrait, head and shoulders only, face fills most of the frame. No full body. Square format, no text or logos.";
  const ref = POP_CULTURE_REFS[Math.floor(Math.random() * POP_CULTURE_REFS.length)];
  return `${constraints} ${ref}.`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { type } = body;

    let style = "";

    if (type === "cartoon") {
      style = buildCartoonPrompt();
    } else if (type === "pop_culture") {
      style = buildPopCulturePrompt();
    } else if (type === "cyberpunk") {
      // Cyberpunk variants only
      const cyberpunkRefs = [
        "Cyberpunk 2077 style",
        "Shadowrun style",
        "Blade Runner aesthetic",
        "Ghost in the Shell style",
        "Akira style",
      ];
      const steampunkRefs = [
        "Steampunk aesthetic",
        "Bioshock Infinite style",
        "Dishonored style",
      ];
      const allRefs = [...cyberpunkRefs, ...steampunkRefs];
      const ref = allRefs[Math.floor(Math.random() * allRefs.length)];
      style = `Bust portrait, head and shoulders only, face fills most of the frame. No full body. Square format, no text or logos. ${ref}.`;
    } else {
      // Default: pop culture (movies, TV, games, comics)
      style = buildPopCulturePrompt();
    }

    return NextResponse.json({ style });
  } catch (err) {
    console.error("[generate-style] failed:", err);
    return NextResponse.json({ error: "Style generation failed" }, { status: 500 });
  }
}
