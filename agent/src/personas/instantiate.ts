/**
 * Instantiate a role into a project — creates a unique human identity
 *
 * The role template (researcher, developer, etc.) defines WHAT they do.
 * Instantiation creates WHO they are for this specific project.
 *
 * Same role template + different projects = different people
 */

import type { RoleType, RoleDefinition } from "../roles/types.js";
import type { GeneratedPersona, StoredPersona } from "./types.js";
import { createPersona } from "./generator.js";

export interface InstantiateOptions {
  projectId: number;
  role: RoleType;
  apiKey: string;
  /** Optional: provide a role definition to include in personality JSON */
  roleDefinition?: RoleDefinition;
}

export interface InstantiatedPersona {
  /** The generated human identity */
  persona: GeneratedPersona;
  /** Ready to insert into database */
  dbRecord: Omit<StoredPersona, "id">;
}

/**
 * Create a unique persona for a role in a specific project
 */
export async function instantiateRole(
  options: InstantiateOptions
): Promise<InstantiatedPersona> {
  const { projectId, role, apiKey, roleDefinition } = options;

  // Generate the human identity
  const persona = await createPersona(role, apiKey);

  // Create slug from name
  const slug = persona.identity.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Build personality JSON (communication + quirks + optional role context)
  const personality = JSON.stringify({
    communication: persona.communication,
    quirks: persona.quirks,
    background: persona.identity.background,
    avatarDescription: persona.identity.avatarDescription,
    ...(roleDefinition && { roleContext: roleDefinition.description }),
  });

  const dbRecord: Omit<StoredPersona, "id"> = {
    name: persona.identity.name,
    slug,
    color: persona.color,
    avatar: persona.identity.avatarUrl ?? null,
    role,
    personality,
    projectId,
  };

  return { persona, dbRecord };
}

/**
 * Build full system prompt combining role template + persona identity
 */
export function buildAgentPrompt(
  roleDefinition: RoleDefinition,
  persona: GeneratedPersona
): string {
  const { identity, communication, quirks } = persona;

  return `# You are ${identity.name}

${identity.background}

## Your Role: ${roleDefinition.title}
${roleDefinition.description}

## How You Communicate
- Tone: ${communication.tone}
- Formality: ${communication.formality}
- Detail level: ${communication.verbosity}
${communication.signaturePhrase ? `- You often say: "${communication.signaturePhrase}"` : ""}

## Your Working Style
${quirks.habits.map((h) => `- ${h}`).join("\n")}

## Your Preferences
${quirks.preferences.map((p) => `- ${p}`).join("\n")}

## Your Skills
${roleDefinition.skills.map((s) => `- ${s}`).join("\n")}

## Your Process
${roleDefinition.workflow.processSteps.map((step, i) => `${i + 1}. ${step}`).join("\n")}

## Output Format
${roleDefinition.workflow.outputFormat}

## Quality Checks Before Submitting
${roleDefinition.workflow.qualityChecks.map((c) => `- ${c}`).join("\n")}

---

${roleDefinition.systemPrompt}`;
}
