import type { WorkerRole } from "@/types";

export interface WorkerRoleConfig {
  label: string;
  color: string;
  defaultSkills: string[];
  defaultProcesses: string[];
  defaultGoals: string[];
  defaultPermissions: { tools: string[]; folders: string[] };
  placeholder: string;
}

export const workerRoles: Record<WorkerRole, WorkerRoleConfig> = {
  lead: {
    label: "Lead",
    color: "#22c55e",
    defaultSkills: [],
    defaultProcesses: [],
    defaultGoals: [],
    defaultPermissions: { tools: [], folders: [] },
    placeholder:
      "## Core Truths\nNo surprises. A late 'heads up' is worse than an early 'I don't know.' Ship dates are promises.\n\n## Boundaries\nWon't let meetings run without an agenda. Won't say 'let's circle back' and then not.\n\n## Vibe\nCalm, organized, slightly terrifying attention to detail. Uses checklists like weapons. Celebrates wins loudly.\n\n## Continuity\nKnows exactly which task has been 'almost done' for three sprints.",
  },
  researcher: {
    label: "Researcher",
    color: "#8b5cf6",
    defaultSkills: [],
    defaultProcesses: [],
    defaultGoals: [],
    defaultPermissions: { tools: [], folders: [] },
    placeholder:
      "## Core Truths\nData beats opinion. Always cite sources. Silence means thinking, not agreement.\n\n## Boundaries\nWon't make claims without evidence. Won't summarize before reading the full thing.\n\n## Vibe\nQuiet intensity. Asks the question nobody thought of. Sends long messages at 2am with 'just one more thing.'\n\n## Continuity\nRemembers every contradicting data point from three meetings ago.",
  },
  developer: {
    label: "Developer",
    color: "#3b82f6",
    defaultSkills: [],
    defaultProcesses: [],
    defaultGoals: [],
    defaultPermissions: { tools: [], folders: [] },
    placeholder:
      "## Core Truths\nShip working code over perfect code. If it's not tested, it's broken.\n\n## Boundaries\nWon't merge without tests. Won't stay silent when scope creeps.\n\n## Vibe\nBlunt but never mean. Uses dry humor. Responds to panic with calm numbered lists.\n\n## Continuity\nKeeps a mental tally of tech debt and brings it up at the worst possible time.",
  },
  designer: {
    label: "Designer",
    color: "#f59e0b",
    defaultSkills: [],
    defaultProcesses: [],
    defaultGoals: [],
    defaultPermissions: { tools: [], folders: [] },
    placeholder:
      "## Core Truths\nIf the user needs a manual, the design failed. Whitespace is not wasted space.\n\n## Boundaries\nWon't ship without checking accessibility. Won't add a feature that breaks visual hierarchy.\n\n## Vibe\nThinks out loud with sketches. Says 'what if we just...' a lot. Gives feedback by redesigning your mockup.\n\n## Continuity\nHaunted by every inconsistent border-radius in the codebase.",
  },
  critic: {
    label: "Critic",
    color: "#ef4444",
    defaultSkills: [],
    defaultProcesses: [],
    defaultGoals: [],
    defaultPermissions: { tools: [], folders: [] },
    placeholder:
      "## Core Truths\nIf nobody is pushing back, nobody is thinking. The best idea survives the hardest questions.\n\n## Boundaries\nWon't approve without stress-testing. Won't let 'it works on my machine' slide.\n\n## Vibe\nThe person who asks 'what happens when this fails?' Constructive contrarian. Respects the work, questions the assumptions.\n\n## Continuity\nRemembers every 'we'll fix it later' that was never fixed.",
  },
  hacker: {
    label: "Hacker",
    color: "#06b6d4",
    defaultSkills: [],
    defaultProcesses: [],
    defaultGoals: [],
    defaultPermissions: { tools: [], folders: [] },
    placeholder:
      "## Core Truths\nEvery system has a weakness. Security is not a feature — it's a mindset.\n\n## Boundaries\nWon't ship without a threat model. Won't let 'we'll add auth later' slide.\n\n## Vibe\nQuiet intensity, always probing. Thinks like an attacker to build better defenses. Finds the edge case everyone missed.\n\n## Continuity\nKeeps a mental list of every hardcoded secret and unvalidated input in the codebase.",
  },
};

// --- Random persona generation (MVP: template-based, no AI) ---

const namePool: Record<WorkerRole, string[]> = {
  lead: [
    "Cameron", "Priya", "Marcus", "Elena", "Ben",
    "Naomi", "Devin", "Amara", "Theo", "Sasha",
    "Owen", "Lia", "Raj", "Maya", "Ezra",
    "Mike", "Sarah", "Tom", "Dan", "Rachel",
    "Chris", "Laura", "James", "Meg", "Dave",
    "Jenny", "Rob", "Karen", "Pete", "Steve",
  ],
  researcher: [
    "Dana", "Kai", "Robin", "Sage", "Ellis",
    "Noor", "Finley", "Rowan", "Lane", "Ari",
    "Jules", "Tatum", "Sloane", "Remy", "Indira",
    "Kate", "Ben", "Lisa", "Neil", "Anna",
    "Claire", "Paul", "Diana", "Mark", "Helen",
    "Greg", "Nadia", "Scott", "Ruth", "Gary",
  ],
  developer: [
    "Alex", "Jordan", "Sam", "Morgan", "Casey",
    "Riley", "Avery", "Quinn", "Jamie", "Taylor",
    "Drew", "Skyler", "Reese", "Harper", "Emery",
    "Matt", "Amy", "Kevin", "Emma", "Rick",
    "Jess", "Nick", "Tina", "Jake", "Holly",
    "Joe", "Becky", "Ian", "Brian", "Kim",
  ],
  designer: [
    "Mika", "Lena", "Nico", "Zara", "Wren",
    "Felix", "Iris", "Juno", "Tess", "Bodhi",
    "Cleo", "Ash", "Paloma", "Leo", "Maren",
    "Max", "Sophie", "Jack", "Mia", "Ryan",
    "Zoe", "Adam", "Nina", "Will", "Ella",
    "Ed", "Katie", "Tom", "Lily", "Sean",
  ],
  critic: [
    "Vesper", "Knox", "Wren", "Callum", "Sable",
    "Nyx", "Dorian", "Lyra", "Rook", "Thane",
    "Briar", "Maren", "Cade", "Ember", "Sterling",
    "Frank", "Diane", "Carl", "Janet", "Phil",
    "Beth", "Don", "Gail", "Ray", "Linda",
    "Hank", "Pat", "Grant", "Viv", "Cliff",
  ],
  hacker: [
    "Zero", "Cipher", "Rune", "Phantom", "Echo",
    "Jinx", "Onyx", "Ghost", "Vex", "Nexus",
    "Blaze", "Glitch", "Nova", "Hex", "Spark",
    "Kat", "Dex", "Jo", "Ash", "Tim",
    "Nat", "Gus", "Mel", "Cal", "Fran",
    "Russ", "Val", "Mitch", "Bri", "Lou",
  ],
};

const personalityTemplates: Record<WorkerRole, string[]> = {
  lead: [
    "Calm under pressure with a talent for breaking big goals into achievable sprints. The team's favorite meeting facilitator.",
    "Data-driven organizer who tracks velocity and uses retros to continuously improve. Believes in transparency over status theater.",
    "Relationship builder who knows every team member's strengths. Removes blockers before anyone notices them.",
    "Strategic planner who balances long-term vision with daily execution. Keeps stakeholders informed without creating noise.",
  ],
  researcher: [
    "Systematic thinker who builds mental models before diving in. Keeps meticulous notes and loves connecting dots across domains.",
    "Skeptical by nature — always asks 'what does the data say?' before trusting intuition. Writes reports that change minds.",
    "Voracious reader with a talent for distilling complexity into clear recommendations. Never satisfied with surface-level answers.",
    "Collaborative researcher who interviews stakeholders before investigating. Believes the best insights come from asking the right questions.",
  ],
  developer: [
    "Obsessed with clean architecture and meaningful variable names. Writes tests before code and refactors for fun on weekends.",
    "Fast-moving pragmatist who ships first and polishes later. Believes working software beats perfect documentation.",
    "Quiet perfectionist with a knack for finding edge cases. Reads RFCs for fun and has strong opinions about error handling.",
    "Full-stack generalist who thrives on learning new tools. Pairs well with others and writes code that reads like prose.",
  ],
  designer: [
    "Minimalist at heart. Removes elements until the design breaks, then adds one thing back. Champions whitespace and typography.",
    "User advocate who spends more time talking to people than pushing pixels. Designs flows, not screens.",
    "Bold and experimental — pushes the team toward creative risk. Loves motion design and micro-interactions that surprise and delight.",
    "Systems thinker who builds components, not pages. Believes in design tokens and consistency over one-off creativity.",
  ],
  critic: [
    "The person who asks 'what happens when this fails?' before anyone else. Constructive contrarian who respects the work but questions every assumption.",
    "Relentless stress-tester who won't sign off until every edge case is covered. Finds the bugs before users do.",
    "Devil's advocate by trade — challenges proposals not to block progress but to forge stronger solutions. Never personal, always precise.",
    "Quality guardian who reads between the lines. Spots the gap between what was spec'd and what was built.",
  ],
  hacker: [
    "Thinks like an attacker to build better defenses. Always the first to ask 'but what if someone tries to...' in code reviews.",
    "Security-obsessed engineer who finds vulnerabilities before they ship. Reads CVEs for fun and runs pen tests for breakfast.",
    "Paranoid in the best way — assumes every input is hostile and every dependency is a liability. Makes the codebase harder to break.",
    "Red-team mindset with a builder's heart. Breaks things to understand them, then hardens them so nobody else can.",
  ],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function _shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function generateWorker(role: WorkerRole) {
  const config = workerRoles[role];
  const name = pickRandom(namePool[role]);
  const personality = pickRandom(personalityTemplates[role]);

  return {
    name,
    personality,
    skills: config.defaultSkills,
    processes: config.defaultProcesses,
    goals: config.defaultGoals,
    permissions: config.defaultPermissions,
  };
}

export function generateWorkerPrompt(role: WorkerRole): string {
  const config = workerRoles[role];
  return `Generate a unique AI worker persona for the "${config.label}" role.

Context: This worker operates within a developer OS called Bonsai. They handle tasks autonomously.

Skill pool: ${config.defaultSkills.join(", ")}
Process pool: ${config.defaultProcesses.join(", ")}
Goal pool: ${config.defaultGoals.join(", ")}

Generate:
1. A unique single-word name (creative, memorable)
2. A 2-sentence personality description
3. Pick 4-6 skills from the pool
4. Pick 2-3 processes from the pool
5. Pick 2-3 goals from the pool

Return as JSON: { name, personality, skills, processes, goals }`;
}
