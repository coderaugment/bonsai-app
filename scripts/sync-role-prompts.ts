/**
 * Sync role prompts from markdown files to database
 *
 * Reads prompts from prompts/roles/*.md and updates the roles table.
 * This makes the markdown files the source of truth for role prompts.
 *
 * Usage: npm run prompts:sync
 */

import { db } from '../src/db/index';
import { roles } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';

const PROMPTS_DIR = path.join(process.cwd(), 'prompts', 'roles');

interface RolePrompt {
  slug: string;
  filepath: string;
  content: string;
}

async function syncRolePrompts() {
  console.log('🔄 Syncing role prompts from markdown files to database...\n');

  // Find all markdown files in prompts/roles directory
  const files = fs.readdirSync(PROMPTS_DIR)
    .filter(f => f.endsWith('.md') && f !== 'README.md')
    .map(f => ({
      slug: f.replace('.md', ''),
      filepath: path.join(PROMPTS_DIR, f),
      content: '',
    }));

  if (files.length === 0) {
    console.log('⚠️  No role prompt files found in', PROMPTS_DIR);
    return;
  }

  // Read content from each file
  const prompts: RolePrompt[] = files.map(f => ({
    ...f,
    content: fs.readFileSync(f.filepath, 'utf-8').trim(),
  }));

  console.log(`Found ${prompts.length} role prompt files:\n`);

  let updated = 0;
  let skipped = 0;

  for (const { slug, filepath, content } of prompts) {
    // Check if role exists in database
    const role = db.select().from(roles).where(eq(roles.slug, slug)).get();

    if (!role) {
      console.log(`⚠️  ${slug}.md - Role not found in database (skipping)`);
      skipped++;
      continue;
    }

    // Update role prompt in database
    db.update(roles)
      .set({ systemPrompt: content })
      .where(eq(roles.slug, slug))
      .run();

    const lines = content.split('\n').length;
    const chars = content.length;
    console.log(`✅ ${slug}.md → database (${lines} lines, ${chars} chars)`);
    updated++;
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Total:   ${prompts.length}`);

  if (updated > 0) {
    console.log(`\n✨ Role prompts synced successfully!`);
    console.log(`   Agents will use these prompts on next dispatch.`);
  }
}

syncRolePrompts().catch((err) => {
  console.error('❌ Error syncing role prompts:', err);
  process.exit(1);
});
