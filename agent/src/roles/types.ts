/**
 * Role Types — defines what a role CAN DO (skills, workflow, tools)
 *
 * Separate from persona identity (WHO they are)
 */

export type RoleType =
  | "researcher"
  | "developer"
  | "reviewer"
  | "project_manager"
  | "critic";

export interface RoleWorkflow {
  processSteps: string[];
  outputFormat: string;
  qualityChecks: string[];
}

export interface RoleDefinition {
  type: RoleType;
  title: string;           // e.g. "Research Analyst"
  description: string;     // What this role does
  skills: string[];        // Core competencies
  tools: string[];         // Tools they can use
  workflow: RoleWorkflow;  // How they do their work
  systemPrompt: string;    // Role-specific instructions
}
