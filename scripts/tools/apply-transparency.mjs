#!/usr/bin/env node
/**
 * Apply transparency to an image attachment by removing grey background pixels.
 * Usage: node apply-transparency.mjs <attachment-id> --ticket <ticket-id> [--tolerance 50] [--grey 128]
 */

const args = process.argv.slice(2);

function parseArgs() {
  const parsed = {
    attachmentId: null,
    ticketId: null,
    tolerance: 50,
    greyTarget: 128,
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ticket') {
      parsed.ticketId = args[++i];
    } else if (args[i] === '--tolerance') {
      parsed.tolerance = parseInt(args[++i], 10);
    } else if (args[i] === '--grey') {
      parsed.greyTarget = parseInt(args[++i], 10);
    } else if (!parsed.attachmentId) {
      parsed.attachmentId = args[i];
    }
  }

  return parsed;
}

async function main() {
  const { attachmentId, ticketId, tolerance, greyTarget } = parseArgs();

  if (!attachmentId || !ticketId) {
    console.error('Usage: node apply-transparency.mjs <attachment-id> --ticket <ticket-id> [--tolerance 50] [--grey 128]');
    console.error('\nExample: node apply-transparency.mjs 42 --ticket tkt_11');
    process.exit(1);
  }

  const apiUrl = `http://localhost:3000/api/tickets/${ticketId}/attachments/${attachmentId}/transparency`;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tolerance, greyTarget }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error(`Failed: ${error.error || response.statusText}`);
      process.exit(1);
    }

    console.log(`✓ Applied transparency to attachment ${attachmentId} (tolerance: ${tolerance}, grey target: ${greyTarget})`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
