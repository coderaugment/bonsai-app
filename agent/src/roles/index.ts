/**
 * Role Templates — exported for use
 */

export type { RoleType, RoleDefinition, RoleWorkflow } from "./types.js";
export { researcherRole } from "./researcher.js";
export { plannerRole } from "./planner.js";
export { developerRole } from "./developer.js";
export { criticRole } from "./critic.js";

import { researcherRole } from "./researcher.js";
import { plannerRole } from "./planner.js";
import { developerRole } from "./developer.js";
import { criticRole } from "./critic.js";
import type { RoleDefinition, RoleType } from "./types.js";

/** All available role templates */
export const roles: Record<RoleType, RoleDefinition> = {
  researcher: researcherRole,
  developer: developerRole,
  critic: criticRole,
  reviewer: researcherRole,       // placeholder
  project_manager: researcherRole, // placeholder
};

export function getRole(type: RoleType): RoleDefinition {
  return roles[type];
}
