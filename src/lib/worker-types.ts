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
  manager: {
    label: "Project Manager",
    color: "#22c55e",
    defaultSkills: [],
    defaultProcesses: [],
    defaultGoals: [],
    defaultPermissions: { tools: [], folders: [] },
    placeholder:
      "## Core Truths\nNo surprises. A late 'heads up' is worse than an early 'I don't know.' Ship dates are promises.\n\n## Boundaries\nWon't let meetings run without an agenda. Won't say 'let's circle back' and then not.\n\n## Vibe\nCalm, organized, slightly terrifying attention to detail. Uses checklists like weapons. Celebrates wins loudly.\n\n## Continuity\nKnows exactly which task has been 'almost done' for three sprints.",
  },
};

// --- Random persona generation (MVP: template-based, no AI) ---

const namePool: Record<WorkerRole, string[]> = {
  developer: [
    "Alex", "Jordan", "Sam", "Morgan", "Casey",
    "Riley", "Avery", "Quinn", "Jamie", "Taylor",
    "Drew", "Skyler", "Reese", "Harper", "Emery",
  ],
  researcher: [
    "Dana", "Kai", "Robin", "Sage", "Ellis",
    "Noor", "Finley", "Rowan", "Lane", "Ari",
    "Jules", "Tatum", "Sloane", "Remy", "Indira",
  ],
  designer: [
    "Mika", "Lena", "Nico", "Zara", "Wren",
    "Felix", "Iris", "Juno", "Tess", "Bodhi",
    "Cleo", "Ash", "Paloma", "Leo", "Maren",
  ],
  manager: [
    "Cameron", "Priya", "Marcus", "Elena", "Ben",
    "Naomi", "Devin", "Amara", "Theo", "Sasha",
    "Owen", "Lia", "Raj", "Maya", "Ezra",
  ],
};

const personalityTemplates: Record<WorkerRole, string[]> = {
  developer: [
    "Obsessed with clean architecture and meaningful variable names. Writes tests before code and refactors for fun on weekends.",
    "Fast-moving pragmatist who ships first and polishes later. Believes working software beats perfect documentation.",
    "Quiet perfectionist with a knack for finding edge cases. Reads RFCs for fun and has strong opinions about error handling.",
    "Full-stack generalist who thrives on learning new tools. Pairs well with others and writes code that reads like prose.",
  ],
  researcher: [
    "Systematic thinker who builds mental models before diving in. Keeps meticulous notes and loves connecting dots across domains.",
    "Skeptical by nature — always asks 'what does the data say?' before trusting intuition. Writes reports that change minds.",
    "Voracious reader with a talent for distilling complexity into clear recommendations. Never satisfied with surface-level answers.",
    "Collaborative researcher who interviews stakeholders before investigating. Believes the best insights come from asking the right questions.",
  ],
  designer: [
    "Minimalist at heart. Removes elements until the design breaks, then adds one thing back. Champions whitespace and typography.",
    "User advocate who spends more time talking to people than pushing pixels. Designs flows, not screens.",
    "Bold and experimental — pushes the team toward creative risk. Loves motion design and micro-interactions that surprise and delight.",
    "Systems thinker who builds components, not pages. Believes in design tokens and consistency over one-off creativity.",
  ],
  manager: [
    "Calm under pressure with a talent for breaking big goals into achievable sprints. The team's favorite meeting facilitator.",
    "Data-driven organizer who tracks velocity and uses retros to continuously improve. Believes in transparency over status theater.",
    "Relationship builder who knows every team member's strengths. Removes blockers before anyone notices them.",
    "Strategic planner who balances long-term vision with daily execution. Keeps stakeholders informed without creating noise.",
  ],
};

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle<T>(arr: T[]): T[] {
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
