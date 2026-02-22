/**
 * Persona Types — the HUMAN aspects of an agent
 *
 * This is separate from their role/skills. A persona is WHO they are:
 * - Name, avatar, background
 * - Personality and communication style
 * - Quirks that make them feel real
 *
 * Generated once per project, stored in the database.
 */

import type { RoleType } from "../roles/types.js";

export interface PersonaIdentity {
  name: string;
  avatarDescription: string;  // Used to generate avatar via nano banana
  avatarUrl?: string;         // Generated avatar URL
  title: string;              // e.g. "Senior Research Analyst"
  background: string;         // Brief backstory
}

export interface PersonaCommunication {
  tone: string;               // e.g. "warm but precise"
  signaturePhrase?: string;   // Something they tend to say
  emojiUsage: "none" | "minimal" | "moderate" | "frequent";
  formality: "casual" | "professional" | "academic";
  verbosity: "concise" | "balanced" | "detailed";
}

export interface PersonaQuirks {
  habits: string[];           // Working habits
  preferences: string[];      // How they like things done
  petPeeves: string[];        // Things that annoy them
}

export interface GeneratedPersona {
  identity: PersonaIdentity;
  role: RoleType;
  communication: PersonaCommunication;
  quirks: PersonaQuirks;
  color: string;              // Hex color for UI
}

/**
 * What we store in the database (maps to personas table)
 */
export interface StoredPersona {
  id: string;
  name: string;
  slug: string;
  color: string;
  avatar: string | null;
  role: RoleType;
  personality: string;        // JSON of communication + quirks
  projectId: number | null;   // null = in the "pool", not assigned to project
}
