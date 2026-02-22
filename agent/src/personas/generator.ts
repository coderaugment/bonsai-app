/**
 * Persona Generator — creates unique human identities for agent roles
 *
 * Uses Claude to generate diverse, realistic personas with:
 * - Unique names and backgrounds
 * - Distinct communication styles
 * - Quirks that make them feel real
 *
 * Uses nano banana for avatar generation based on descriptions.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { RoleType } from "../roles/types.js";
import type { GeneratedPersona, PersonaIdentity, PersonaCommunication, PersonaQuirks } from "./types.js";

const GENERATION_PROMPT = `Generate a unique, realistic persona for a software team member.

Role: {{ROLE}}
Role Title: {{TITLE}}

Create a believable person with:
1. A realistic full name (diverse backgrounds welcome)
2. A brief background (2-3 sentences, what did they do before? hobbies?)
3. A visual description for avatar generation (age range, style, distinguishing features)
4. Communication style (how do they talk? formal/casual? verbose/concise?)
5. A signature phrase they tend to use
6. Working habits (3-4 specific behaviors)
7. Preferences (how they like things done)
8. Pet peeves (things that annoy them professionally)

Make them feel like a real person, not a stereotype. Give them depth and quirks.

Respond in this exact JSON format:
{
  "name": "Full Name",
  "background": "Brief backstory...",
  "avatarDescription": "Visual description for avatar generation...",
  "tone": "Description of their communication tone",
  "signaturePhrase": "Something they often say",
  "emojiUsage": "none" | "minimal" | "moderate" | "frequent",
  "formality": "casual" | "professional" | "academic",
  "verbosity": "concise" | "balanced" | "detailed",
  "habits": ["habit 1", "habit 2", "habit 3"],
  "preferences": ["preference 1", "preference 2"],
  "petPeeves": ["pet peeve 1", "pet peeve 2"],
  "color": "#hexcolor"
}`;

const ROLE_TITLES: Record<RoleType, string> = {
  researcher: "Research Analyst",
  developer: "Software Developer",
  critic: "Research Critic",
  reviewer: "Code Reviewer",
  project_manager: "Project Manager",
};

interface GenerationResult {
  name: string;
  background: string;
  avatarDescription: string;
  tone: string;
  signaturePhrase: string;
  emojiUsage: "none" | "minimal" | "moderate" | "frequent";
  formality: "casual" | "professional" | "academic";
  verbosity: "concise" | "balanced" | "detailed";
  habits: string[];
  preferences: string[];
  petPeeves: string[];
  color: string;
}

export async function generatePersona(
  role: RoleType,
  apiKey: string
): Promise<GeneratedPersona> {
  const client = new Anthropic({ apiKey });

  const prompt = GENERATION_PROMPT
    .replace("{{ROLE}}", role)
    .replace("{{TITLE}}", ROLE_TITLES[role]);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  // Extract JSON from response
  const block = response.content[0];
  if (!block || block.type !== "text") {
    throw new Error("Unexpected response format from persona generation");
  }
  const text = block.text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse persona generation response");
  }

  const result: GenerationResult = JSON.parse(jsonMatch[0]);

  const identity: PersonaIdentity = {
    name: result.name,
    avatarDescription: result.avatarDescription,
    title: `Senior ${ROLE_TITLES[role]}`,
    background: result.background,
  };

  const communication: PersonaCommunication = {
    tone: result.tone,
    signaturePhrase: result.signaturePhrase,
    emojiUsage: result.emojiUsage,
    formality: result.formality,
    verbosity: result.verbosity,
  };

  const quirks: PersonaQuirks = {
    habits: result.habits,
    preferences: result.preferences,
    petPeeves: result.petPeeves,
  };

  return {
    identity,
    role,
    communication,
    quirks,
    color: result.color,
  };
}

/**
 * Generate avatar URL using nano banana
 * (placeholder — implement with actual nano banana API)
 */
export async function generateAvatar(description: string): Promise<string> {
  // TODO: Integrate with nano banana API
  // For now, return a placeholder
  const encoded = encodeURIComponent(description.slice(0, 50));
  return `https://api.dicebear.com/7.x/personas/svg?seed=${encoded}`;
}

/**
 * Generate a complete persona with avatar
 */
export async function createPersona(
  role: RoleType,
  apiKey: string
): Promise<GeneratedPersona> {
  const persona = await generatePersona(role, apiKey);
  persona.identity.avatarUrl = await generateAvatar(persona.identity.avatarDescription);
  return persona;
}
