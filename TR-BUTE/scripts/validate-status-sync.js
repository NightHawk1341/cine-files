#!/usr/bin/env node
/**
 * validate-status-sync.js
 * Checks that the user-facing STATUS_NAMES in public/js/pages/order/constants.js
 * covers all VALID_STATUSES defined in server/utils/order-constants.js.
 */

const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

const SERVER_CONSTANTS = path.join(__dirname, '../server/utils/order-constants.js');
const CLIENT_CONSTANTS = path.join(__dirname, '../public/js/pages/order/constants.js');

let exitCode = 0;

// Read server VALID_STATUSES
const serverSrc = fs.readFileSync(SERVER_CONSTANTS, 'utf8');
const validStatusesMatch = serverSrc.match(/const VALID_STATUSES\s*=\s*\[([\s\S]*?)\]/);
if (!validStatusesMatch) {
  console.error(`${colors.red}Could not parse VALID_STATUSES from server constants${colors.reset}`);
  process.exit(1);
}
const serverStatuses = validStatusesMatch[1]
  .split(',')
  .map(s => s.replace(/['"'\s]/g, ''))
  .filter(Boolean);

// Read client STATUS_NAMES keys
const clientSrc = fs.readFileSync(CLIENT_CONSTANTS, 'utf8');
const statusNamesMatch = clientSrc.match(/export const STATUS_NAMES\s*=\s*\{([\s\S]*?)\};/);
if (!statusNamesMatch) {
  console.error(`${colors.red}Could not parse STATUS_NAMES from client constants${colors.reset}`);
  process.exit(1);
}
const clientStatusKeys = [...statusNamesMatch[1].matchAll(/'([^']+)'\s*:/g)].map(m => m[1]);

// Check every VALID_STATUS has a key in STATUS_NAMES
const missing = serverStatuses.filter(s => !clientStatusKeys.includes(s));
if (missing.length > 0) {
  console.error(`${colors.red}Status sync error: the following VALID_STATUSES are missing from STATUS_NAMES in public/js/pages/order/constants.js:${colors.reset}`);
  missing.forEach(s => console.error(`  ${colors.red}- ${s}${colors.reset}`));
  exitCode = 1;
} else {
  console.log(`${colors.green}Status sync OK — all ${serverStatuses.length} VALID_STATUSES present in client STATUS_NAMES${colors.reset}`);
}

process.exit(exitCode);
