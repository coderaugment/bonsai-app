import { db } from './src/db/index.js';
import { tickets } from './src/db/schema.js';
import { desc, isNull } from 'drizzle-orm';

const allTickets = db.select({
  id: tickets.id,
  title: tickets.title,
  state: tickets.state,
  assigneeId: tickets.assigneeId,
  createdAt: tickets.createdAt
}).from(tickets).where(isNull(tickets.deletedAt)).orderBy(desc(tickets.id)).all();

// Group by normalized title (lowercase, trimmed)
const groups = new Map();
allTickets.forEach(t => {
  const normalized = t.title.toLowerCase().trim();
  if (!groups.has(normalized)) {
    groups.set(normalized, []);
  }
  groups.get(normalized).push(t);
});

// Show duplicates (groups with more than 1 ticket)
const duplicates = Array.from(groups.entries()).filter(([_, tickets]) => tickets.length > 1);

console.log('=== DUPLICATE TICKETS ===\n');
duplicates.forEach(([title, dupes]) => {
  console.log(`📦 ${dupes.length}x: ${title}`);
  dupes.forEach(d => {
    console.log(`   • Ticket #${d.id} | ${d.state} | assigned: ${d.assigneeId || 'none'} | created: ${d.createdAt}`);
  });
  console.log('');
});

console.log(`\nTotal: ${allTickets.length} tickets`);
console.log(`Unique titles: ${groups.size}`);
console.log(`Duplicate groups: ${duplicates.length}`);
const wasteCount = duplicates.reduce((sum, [_, dups]) => sum + (dups.length - 1), 0);
console.log(`Wasted tickets: ${wasteCount}`);
