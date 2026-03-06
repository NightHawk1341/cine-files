#!/usr/bin/env node
/**
 * Password Hash Generator
 *
 * Generates a bcrypt hash for the ADMIN_PASSWORD environment variable.
 *
 * Usage:
 *   node scripts/generate-password-hash.js <password>
 *   node scripts/generate-password-hash.js mySecurePassword123
 *
 * Then set ADMIN_PASSWORD in your environment to the generated hash.
 */

const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

async function generateHash() {
  const password = process.argv[2];

  if (!password) {
    console.error('Usage: node scripts/generate-password-hash.js <password>');
    console.error('Example: node scripts/generate-password-hash.js mySecurePassword123');
    process.exit(1);
  }

  try {
    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    console.log('\n--- Generated Password Hash ---');
    console.log(hash);
    console.log('\nSet this as your ADMIN_PASSWORD environment variable.');
    console.log('Example in .env file:');
    console.log(`ADMIN_PASSWORD=${hash}`);
    console.log('\nNote: The hash will be different each time you run this script,');
    console.log('but all generated hashes for the same password will work.');
  } catch (error) {
    console.error('Error generating hash:', error.message);
    process.exit(1);
  }
}

generateHash();
