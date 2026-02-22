import { z } from 'zod';
import type { JsonSchema, JsonSchemaProperty } from './types.js';

export function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): JsonSchema {
  const shape = schema._def.shape();
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    properties[key] = zodTypeToJsonSchemaProperty(value as z.ZodTypeAny);
    if (!value.isOptional()) {
      required.push(key);
    }
  }

  return {
    type: 'object',
    properties,
    ...(required.length > 0 && { required }),
  };
}

function zodTypeToJsonSchemaProperty(zodType: z.ZodTypeAny): JsonSchemaProperty {
  // Handle optional types
  if (zodType instanceof z.ZodOptional) {
    return zodTypeToJsonSchemaProperty(zodType._def.innerType);
  }

  // Handle primitive types
  if (zodType instanceof z.ZodString) {
    const desc = zodType._def.description;
    return { type: 'string', ...(desc && { description: desc }) };
  }
  if (zodType instanceof z.ZodNumber) {
    const desc = zodType._def.description;
    return { type: 'number', ...(desc && { description: desc }) };
  }
  if (zodType instanceof z.ZodBoolean) {
    const desc = zodType._def.description;
    return { type: 'boolean', ...(desc && { description: desc }) };
  }

  // Handle enums
  if (zodType instanceof z.ZodEnum) {
    const desc = zodType._def.description;
    return {
      type: 'string',
      enum: zodType._def.values,
      ...(desc && { description: desc }),
    };
  }

  // Handle arrays
  if (zodType instanceof z.ZodArray) {
    const desc = zodType._def.description;
    return {
      type: 'array',
      items: zodTypeToJsonSchemaProperty(zodType._def.type),
      ...(desc && { description: desc }),
    };
  }

  // Handle objects (recursive)
  if (zodType instanceof z.ZodObject) {
    const shape = zodType._def.shape();
    const properties: Record<string, JsonSchemaProperty> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodTypeToJsonSchemaProperty(value as z.ZodTypeAny);
      if (!(value as z.ZodTypeAny).isOptional()) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      ...(required.length > 0 && { required }),
    };
  }

  // Fallback
  return { type: 'string' };
}
