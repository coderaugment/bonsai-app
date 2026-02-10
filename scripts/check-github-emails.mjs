#!/usr/bin/env node
import { Vault } from '../src/lib/vault.js';

const vault = new Vault();
const token = await vault.get('github_token');

if (!token) {
  console.log('No GitHub token found in vault');
  process.exit(1);
}

// Get detailed user info
const userRes = await fetch('https://api.github.com/user', {
  headers: {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json'
  }
});
const user = await userRes.json();

// Get all email addresses
const emailRes = await fetch('https://api.github.com/user/emails', {
  headers: {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json'
  }
});
const emails = await emailRes.json();

console.log('=== GitHub Account: coderaugment ===');
console.log('Username:', user.login);
console.log('Name:', user.name);
console.log('Public email:', user.email || '(not set)');
console.log('Created:', new Date(user.created_at).toLocaleDateString());
console.log('\nAll emails associated with account:');
if (Array.isArray(emails)) {
  emails.forEach(e => {
    const status = [];
    if (e.primary) status.push('PRIMARY');
    if (e.verified) status.push('verified');
    console.log(`  ${e.email} ${status.length ? `(${status.join(', ')})` : ''}`);
  });
} else {
  console.log('Error fetching emails:', emails.message);
}
