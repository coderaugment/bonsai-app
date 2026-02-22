/**
 * Roster Management — fantasy football style team building
 *
 * Personas can be:
 * - In the "pool" (projectId = null) — free agents
 * - Assigned to a project — on the roster
 *
 * Admins can:
 * - Generate new personas into the pool
 * - Draft personas from pool to project
 * - Release personas back to pool
 * - Trade personas between projects (future)
 */

import type { RoleType } from "../roles/types.js";
import type { StoredPersona } from "./types.js";

/**
 * Roster represents a project's team of personas
 */
export interface ProjectRoster {
  projectId: number;
  personas: StoredPersona[];
  /** Check if role is filled */
  hasRole(role: RoleType): boolean;
  /** Get persona by role */
  getByRole(role: RoleType): StoredPersona | undefined;
}

/**
 * Pool represents available free agent personas
 */
export interface PersonaPool {
  personas: StoredPersona[];
  /** Get available personas by role */
  getByRole(role: RoleType): StoredPersona[];
  /** Get all available personas */
  getAll(): StoredPersona[];
}

/**
 * Draft operations
 */
export interface DraftOperations {
  /** Move persona from pool to project */
  draftToProject(personaId: string, projectId: number): Promise<void>;
  /** Release persona back to pool */
  releaseToPool(personaId: string): Promise<void>;
  /** Generate new persona into pool */
  generateToPool(role: RoleType): Promise<StoredPersona>;
  /** Generate and immediately draft to project */
  generateAndDraft(role: RoleType, projectId: number): Promise<StoredPersona>;
}

/**
 * Team composition requirements
 */
export interface TeamRequirements {
  /** Minimum roles needed for a functional team */
  required: RoleType[];
  /** Optional roles that enhance the team */
  optional: RoleType[];
}

export const defaultTeamRequirements: TeamRequirements = {
  required: ["researcher", "developer"],
  optional: ["reviewer", "project_manager"],
};

/**
 * Check if a project has a complete team
 */
export function isTeamComplete(
  roster: StoredPersona[],
  requirements: TeamRequirements = defaultTeamRequirements
): { complete: boolean; missing: RoleType[] } {
  const roles = new Set(roster.map((p) => p.role));
  const missing = requirements.required.filter((r) => !roles.has(r));
  return {
    complete: missing.length === 0,
    missing,
  };
}

/**
 * Get recommended next hire based on team composition
 */
export function getRecommendedHire(
  roster: StoredPersona[],
  requirements: TeamRequirements = defaultTeamRequirements
): RoleType | null {
  const roles = new Set(roster.map((p) => p.role));

  // First fill required roles
  for (const role of requirements.required) {
    if (!roles.has(role)) return role;
  }

  // Then optional roles
  for (const role of requirements.optional) {
    if (!roles.has(role)) return role;
  }

  return null;
}
