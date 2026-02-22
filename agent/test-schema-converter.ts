/**
 * Test Zod to JSON Schema conversion
 */

import { z } from 'zod';
import { zodToJsonSchema } from './src/tools/schema-converter.js';

console.log('=== Schema Converter Tests ===\n');

// Test 1: Simple string with description
const simpleSchema = z.object({
  path: z.string().describe('File path'),
});

console.log('Test 1: Simple string schema');
console.log(JSON.stringify(zodToJsonSchema(simpleSchema), null, 2));
console.log();

// Test 2: Enum schema (used in ticket_update_state)
const enumSchema = z.object({
  state: z.enum(['backlog', 'research', 'in_progress']).describe('Ticket state'),
});

console.log('Test 2: Enum schema');
console.log(JSON.stringify(zodToJsonSchema(enumSchema), null, 2));
console.log();

// Test 3: Optional fields
const optionalSchema = z.object({
  required: z.string().describe('Required field'),
  optional: z.string().optional().describe('Optional field'),
});

console.log('Test 3: Optional fields');
console.log(JSON.stringify(zodToJsonSchema(optionalSchema), null, 2));
console.log();

// Test 4: Array schema
const arraySchema = z.object({
  files: z.array(z.string()).describe('List of files'),
});

console.log('Test 4: Array schema');
console.log(JSON.stringify(zodToJsonSchema(arraySchema), null, 2));
console.log();

// Test 5: Complex nested schema
const complexSchema = z.object({
  name: z.string().describe('Name'),
  age: z.number().optional().describe('Age'),
  tags: z.array(z.string()).describe('Tags'),
  metadata: z.object({
    key: z.string(),
    value: z.string(),
  }).optional().describe('Metadata'),
});

console.log('Test 5: Complex nested schema');
console.log(JSON.stringify(zodToJsonSchema(complexSchema), null, 2));
console.log();

console.log('=== All Schema Tests Complete ===');
