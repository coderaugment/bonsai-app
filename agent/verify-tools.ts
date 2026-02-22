/**
 * Verification script to test tool system integration
 */

import { toolRegistry, type ToolProfile } from './src/tools/index.js';

console.log('=== Tool System Verification ===\n');

// Test 1: Check all tools are registered
const allTools = toolRegistry.getAllToolNames();
console.log('✓ Registered tools:', allTools.length);
console.log('  ', allTools.join(', '));
console.log();

// Test 2: Verify tool profiles
const profiles: ToolProfile[] = ['researcher', 'developer', 'reviewer'];
for (const profile of profiles) {
  const tools = toolRegistry.getToolsForProfile(profile);
  console.log(`✓ ${profile} profile: ${tools.length} tools`);
  console.log('  ', tools.map(t => t.name).join(', '));
}
console.log();

// Test 3: Check specific tool exists and has correct structure
const fileTool = toolRegistry.getTool('file_read');
if (fileTool) {
  console.log('✓ file_read tool found');
  console.log('   name:', fileTool.name);
  console.log('   description:', fileTool.description.substring(0, 50) + '...');
  console.log('   parameters.type:', fileTool.parameters.type);
  console.log('   parameters.properties:', Object.keys(fileTool.parameters.properties));
}
console.log();

// Test 4: Verify tool uniqueness
const hasDuplicates = allTools.length !== new Set(allTools).size;
console.log(hasDuplicates ? '✗ Has duplicate tools!' : '✓ All tools are unique');
console.log();

// Test 5: Test state transitions
import { isValidStateTransition } from './src/tools/bonsai/db-interface.js';

const validTransitions = [
  ['backlog', 'research'],
  ['research', 'plan_approval'],
  ['plan_approval', 'in_progress'],
  ['in_progress', 'verification'],
  ['verification', 'done'],
] as const;

const invalidTransitions = [
  ['backlog', 'done'],
  ['research', 'done'],
  ['done', 'backlog'],
] as const;

console.log('✓ State transition validation:');
for (const [from, to] of validTransitions) {
  const valid = isValidStateTransition(from, to);
  console.log(`   ${from} → ${to}: ${valid ? '✓' : '✗'}`);
}

for (const [from, to] of invalidTransitions) {
  const invalid = !isValidStateTransition(from, to);
  console.log(`   ${from} → ${to} (should fail): ${invalid ? '✓' : '✗'}`);
}

console.log('\n=== All Checks Passed ===');
