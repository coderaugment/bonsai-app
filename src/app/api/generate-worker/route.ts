import { NextResponse } from "next/server";
import type { WorkerRole } from "@/types";
import { workerRoles } from "@/lib/worker-types";
import { geminiRequest, extractText, GeminiKeyError } from "@/lib/gemini";

const MODEL = "gemini-2.5-flash";

const NAMES_MALE = [
  "Aaron", "Abdul", "Abel", "Abram", "Adebayo", "Adil", "Adrian", "Ahmed", "Akinola", "Alain",
  "Alan", "Alejandro", "Alessandro", "Alexei", "Alistair", "Amadi", "Anders", "André", "Andrei", "Andres",
  "Angelo", "Anouk", "Antoine", "Anton", "Anwar", "Arjun", "Arnav", "Arno", "Aron", "Artem",
  "Arvid", "Asher", "Attila", "Augusto", "Aurelio", "Ayaan", "Ayoub", "Aziz", "Baptiste", "Barnaby",
  "Bart", "Benedikt", "Benny", "Bernard", "Bilal", "Bjorn", "Boris", "Brendan", "Bruno", "Callum",
  "Caoimhe", "Carl", "Carlos", "Cedric", "Chidi", "Chijioke", "Chris", "Christoph", "Claude", "Cormac",
  "Damian", "Daniel", "Darius", "Darko", "Dave", "Dawit", "Denis", "Derek", "Desmond", "Devraj",
  "Dhruv", "Diego", "Dimitri", "Dion", "Dmitri", "Dominic", "Duncan", "Dusan", "Dylan", "Eamon",
  "Edgardo", "Edmund", "Eduardo", "Ekene", "Emil", "Emmanuel", "Enrique", "Enzo", "Eric", "Eriksson",
  "Erlan", "Ernesto", "Euan", "Evan", "Fabian", "Faisal", "Femi", "Felix", "Fernando", "Filip",
  "Finley", "Florian", "Fola", "Franck", "François", "Frank", "Frederic", "Gael", "Gareth", "Gary",
  "Gaurav", "Gbenga", "Georg", "Gerard", "Gideon", "Giorgi", "Glen", "Gonzalo", "Gordon", "Graham",
  "Grant", "Gregor", "Guilherme", "Guillaume", "Hamid", "Hamza", "Hank", "Hans", "Hao", "Harald",
  "Haruto", "Hassan", "Hayden", "Henrik", "Hiroshi", "Hugo", "Ibrahima", "Ifechi", "Igor", "Ilya",
  "Imran", "Iosif", "Isaac", "Ivan", "Jae-won", "Jakub", "Jan", "Jared", "Javier", "Jean-Pierre",
  "Jeff", "Jens", "Jesse", "Jian", "Jiho", "Joaquin", "Joel", "Jon", "Jonas", "Jonathan",
  "Jorge", "José", "Josip", "Juan", "Julien", "Kaden", "Kaito", "Kamil", "Kanye", "Karel",
  "Kareem", "Karim", "Karl", "Kasimir", "Kazuhiro", "Keiran", "Keith", "Kelvin", "Kenji", "Kenny",
  "Kevin", "Kieran", "Klaus", "Kofi", "Konrad", "Kristian", "Krzysztof", "Kumar", "Lars", "Leo",
  "Leonard", "Lewis", "Luca", "Luis", "Lukas", "Lukasz", "Maarten", "Maciej", "Magnus", "Maher",
  "Mahmoud", "Makoto", "Malik", "Manuel", "Marc", "Marco", "Marek", "Marko", "Markus", "Martin",
  "Marvin", "Mateusz", "Matt", "Maurice", "Max", "Maxime", "Mehmet", "Michael", "Michal", "Miguel",
  "Mikhail", "Milan", "Miles", "Mirko", "Mohamed", "Mohit", "Moises", "Munir", "Mustafa", "Naoki",
  "Nasser", "Nathan", "Neil", "Nico", "Nicolas", "Nils", "Niraj", "Obi", "Olaf", "Oleg",
  "Omar", "Osei", "Pablo", "Patrick", "Paul", "Pavel", "Pedro", "Pete", "Piotr", "Quentin",
  "Rafael", "Rajan", "Raúl", "Ravi", "Reginald", "Remi", "Renato", "Reuben", "Ricardo", "Richard",
  "Riku", "Rob", "Roberto", "Robin", "Rodrigo", "Roland", "Roman", "Ross", "Ruben", "Ryu",
  "Samir", "Santiago", "Scott", "Sean", "Sebastián", "Sergei", "Shin", "Sigurd", "Simon", "Slava",
  "Soren", "Stefan", "Steve", "Suresh", "Sven", "Takeshi", "Taro", "Teddy", "Terence", "Thibault",
  "Thomas", "Tim", "Tobias", "Tomasz", "Tomas", "Tomoki", "Tosin", "Tunde", "Uche", "Udo",
  "Umar", "Valentín", "Vasile", "Victor", "Vikram", "Vincent", "Vlad", "Volodymyr", "Walter", "Warren",
  "Wei", "Wil", "Wojciech", "Xavier", "Yan", "Yann", "Yannick", "Yosef", "Yuki", "Yusuf",
  "Zach", "Zaid", "Zeke", "Zhen", "Zoran",
];

const NAMES_FEMALE = [
  "Abiodun", "Abimbola", "Ada", "Adaeze", "Adaora", "Aditi", "Agnieszka", "Aiko", "Aila", "Aina",
  "Aisha", "Aiyana", "Akemi", "Akosua", "Alessia", "Alina", "Alinta", "Aliya", "Alondra", "Alva",
  "Amara", "Amelia", "Amina", "Amira", "Amisha", "Anastasia", "Aneta", "Angela", "Anika", "Annika",
  "Antonia", "Aoife", "Aparna", "Ariadne", "Arjana", "Asma", "Astrid", "Atena", "Audrey", "Aurora",
  "Awa", "Ayasha", "Ayse", "Aziza", "Bárbara", "Beatriz", "Belen", "Benita", "Bianca", "Birgit",
  "Bozena", "Brenda", "Brigitte", "Caitlin", "Camille", "Carla", "Carmen", "Carolina", "Caterina", "Catrin",
  "Cecilia", "Chiara", "Chidinma", "Chisom", "Christina", "Claudia", "Constanza", "Dalia", "Damaris", "Dana",
  "Daniela", "Deepa", "Demi", "Diana", "Dijana", "Dina", "Divya", "Dolores", "Dorota", "Elena",
  "Elina", "Elisa", "Elise", "Elke", "Emilia", "Erin", "Esme", "Esther", "Eva", "Fatima",
  "Fatou", "Federica", "Fiona", "Florencia", "Gabriela", "Gao", "Gemma", "Geneviève", "Giulia", "Gloria",
  "Grace", "Greta", "Hannah", "Hanna", "Hayley", "Hina", "Hiromi", "Ingrid", "Irene", "Iris",
  "Jana", "Janina", "Jasmine", "Jing", "Johanna", "Joséphine", "Judith", "Julia", "Karin", "Katarzyna",
  "Kate", "Katerina", "Kathrin", "Kemi", "Kezia", "Kirra", "Kirsten", "Kiri", "Kumari", "Laila",
  "Lara", "Laura", "Layla", "Leila", "Leonie", "Leticia", "Linh", "Linnea", "Lise", "Lorena",
  "Lotte", "Lucía", "Luisa", "Maaike", "Mabel", "Maeva", "Magdalena", "Maie", "Maija", "Mariam",
  "Marta", "Martina", "Matilda", "Mei", "Mele", "Mia", "Michaela", "Mihail", "Mika", "Milena",
  "Miriam", "Mitsuki", "Moana", "Monica", "Mónica", "Nadège", "Nadia", "Nafisa", "Naledi", "Natalia",
  "Natasha", "Nkechi", "Noa", "Nour", "Nwanneka", "Nyasha", "Ola", "Olivia", "Oluwakemi", "Parisa",
  "Parveen", "Patricia", "Paula", "Paz", "Petra", "Pita", "Preethi", "Rada", "Ragnhild", "Rashida",
  "Ratna", "Rebecca", "Renata", "Rhiannon", "Rosa", "Rosario", "Roshani", "Rowena", "Ruxandra", "Sachiko",
  "Sadie", "Safiya", "Sahar", "Sahara", "Salma", "Sandra", "Sara", "Selene", "Selma", "Senna",
  "Seo-yeon", "Shira", "Shreya", "Silje", "Simone", "Sinead", "Siobhan", "Siti", "Soledad", "Sonja",
  "Soraya", "Stella", "Tanya", "Tara", "Taryn", "Tatiana", "Temi", "Teodora", "Thandi", "Toyin",
  "Úrsula", "Valentina", "Valeria", "Vanessa", "Veronika", "Victoria", "Wanjiru", "Xiao", "Xiomara", "Yael",
  "Yamile", "Yoko", "Yuki", "Yuna", "Zahra", "Zara", "Zhen", "Zina", "Zoe", "Zuzanna",
];

const NAMES_NB = [
  "Ade", "Adisa", "Ainsley", "Akira", "Amani", "Amari", "Amos", "Anouk", "Ari", "Ariel",
  "Ash", "Aspen", "Avery", "Bex", "Blake", "Bo", "Caden", "Cai", "Cass", "Cedar",
  "Cleo", "Coby", "Cori", "Cyan", "Dale", "Dani", "Dasha", "Drew", "Echo", "Eli",
  "Ellis", "Ember", "Emery", "Emi", "Eren", "Fen", "Finley", "Flynn", "Fox", "Frankie",
  "Gael", "Gray", "Harlow", "Haven", "Hayden", "Indigo", "Ion", "Jae", "Jory", "Jules",
  "Juni", "Kai", "Kamau", "Kato", "Keiran", "Kelsey", "Kemi", "Kendall", "Kit", "Kodi",
  "Lake", "Lane", "Laurie", "Lee", "Lenn", "Lennox", "Lex", "Lin", "Lior", "Luca",
  "Lux", "Lyric", "Maci", "Mads", "Mar", "Marcel", "Mars", "Maz", "Mika", "Milan",
  "Milo", "Mira", "Misha", "Naki", "Nel", "Nic", "Niko", "Noa", "Noel", "Nym",
  "Obi", "Ocean", "Ori", "Ozzy", "Page", "Pan", "Penn", "Perry", "Piper", "Quincy",
  "Rae", "Rain", "Reese", "Remi", "Ren", "Rex", "River", "Robin", "Rory", "Rowan",
  "Rue", "Rune", "Sable", "Sage", "Scout", "Sen", "Shane", "Shen", "Shiloh", "Skye",
  "Sloane", "Sol", "Soren", "Storm", "Sunny", "Tao", "Tariq", "Tate", "Tay", "Teddy",
  "Thorn", "Tiernan", "Tobi", "Tomás", "Trace", "True", "Uri", "Val", "Vesper", "Wren",
  "Xen", "Yael", "Yuki", "Zane", "Zara", "Zen", "Zev", "Ziggy", "Zion", "Zuri",
];

function pickName(gender: string, takenNames: string[]): string {
  const pool = gender === "female" ? NAMES_FEMALE
    : gender === "non-binary" ? NAMES_NB
    : NAMES_MALE;
  const takenLower = new Set(takenNames.map((n) => n.toLowerCase()));
  const available = pool.filter((n) => !takenLower.has(n.toLowerCase()));
  const list = available.length > 0 ? available : pool;
  return list[Math.floor(Math.random() * list.length)];
}

async function gemini(prompt: string, temperature = 1.0): Promise<Record<string, string>> {
  const res = await geminiRequest(MODEL, {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", temperature },
  });
  const data = await res.json();
  return JSON.parse(extractText(data));
}

export async function POST(req: Request) {
  const { role, field, name, gender, existingNames } = await req.json();
  const takenNames: string[] = Array.isArray(existingNames) ? existingNames : [];
  if (!role) {
    return NextResponse.json({ error: "Role is required" }, { status: 400 });
  }

  const config = workerRoles[role as WorkerRole] || { label: role.replace(/_/g, " ") };
  const g = gender || "male";

  const rerollField = field || "all";
  let prompt: string;

  if (rerollField === "name") {
    // Pure static pick — no LLM needed
    return NextResponse.json({ success: true, name: pickName(g, takenNames) });
  } else if (rerollField === "appearance") {
    prompt = `Generate a 1-2 sentence visual description of a ${g} ${config.label.toLowerCase()} on a software team. Invent a believable, coherent person — their skin tone, hair, clothing style, and any accessories should all feel like they belong to the same real human being. Be specific and vivid. CRITICAL: Describe ONLY their head, neck, and shoulders. Do NOT describe anything below the shoulders (no torso, waist, hips, legs, or full body). Focus on face, hair, and upper clothing (collar, neckline). Do NOT use any name. Do NOT reference nationality or ethnicity by name. Do NOT use the word "lean". This description drives an AI avatar generator for headshots only.

Return ONLY valid JSON: {"appearance": "..."}`;
  } else {
    const hasName = name && name.trim();
    const resolvedName = hasName ? name.trim() : pickName(g, takenNames);
    prompt = `Invent a ${g} ${config.label.toLowerCase()} character for a software team named ${resolvedName}.

Create a coherent, believable person — someone you might actually work with. Their skin tone, hair, clothing, and accessories should all feel like they naturally belong to the same person. Most software engineers are in their 20s-30s — default to that age range. Vary style widely: hoodie and sneakers, blazer and turtleneck, punk rocker, streetwear, preppy, goth, cottagecore — mix it up every time. Do NOT default to grey hair or older appearance.

Appearance: 1-2 vivid sentences describing what they look like. CRITICAL: Describe ONLY their head, neck, and shoulders. Do NOT describe anything below the shoulders (no torso, waist, hips, legs, or full body). Mention skin tone, hair (color, style, texture), upper clothing visible from shoulders up (collar, neckline), and optionally facial accessories (glasses, piercings, hat, etc). Do NOT use any name — write in third person. Do NOT reference nationality or ethnicity by name. Do NOT use the word "lean". This drives an AI avatar generator for headshots only.

Return ONLY valid JSON:
{"name": "${resolvedName}", "appearance": "..."}`;
  }

  try {
    const parsed = await gemini(prompt);
    const result: Record<string, unknown> = { success: true };
    if (parsed.appearance) result.appearance = parsed.appearance;
    if (parsed.name) result.name = parsed.name;

    // Backwards compat: personality field
    if (parsed.appearance) {
      result.personality = parsed.appearance;
    }
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof GeminiKeyError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 401 });
    }
    console.error("Worker generation failed:", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
