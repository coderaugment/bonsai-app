// @bonsai/agent — Bonsai agent runtime
// Extracted from OpenClaw (MIT licensed)

// Tools
export * from './tools/index.js';

// Workspace
export * from "./workspace/index.js";

// Runner
export type { AgentRunner, AgentRunParams, AgentRunResult } from "./runner.js";
export { InProcessAgentRunner } from "./runner/in-process.js";
export { ClaudeCodeRunner } from "./runner/claude-code.js";
export type { ClaudeCodeRunnerOptions } from "./runner/claude-code.js";

// Roles (skills, workflows, tools)
export type { RoleType, RoleDefinition, RoleWorkflow } from "./roles/types.js";
export { researcherRole } from "./roles/researcher.js";

// Personas (human identity, generated)
export type {
  GeneratedPersona,
  PersonaIdentity,
  PersonaCommunication,
  PersonaQuirks,
  StoredPersona,
} from "./personas/types.js";
export { generatePersona, generateAvatar, createPersona } from "./personas/generator.js";
export { instantiateRole, buildAgentPrompt } from "./personas/instantiate.js";
export type { InstantiateOptions, InstantiatedPersona } from "./personas/instantiate.js";

// Roster management (fantasy football style)
export {
  isTeamComplete,
  getRecommendedHire,
  defaultTeamRequirements,
} from "./personas/roster.js";
export type {
  ProjectRoster,
  PersonaPool,
  DraftOperations,
  TeamRequirements,
} from "./personas/roster.js";

// Session management (conversation persistence)
export { SessionStore } from "./session/store.js";
