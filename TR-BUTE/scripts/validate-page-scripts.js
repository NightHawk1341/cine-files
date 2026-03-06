#!/usr/bin/env node
/**
 * validate-page-scripts.js
 * Checks that required shared scripts are present in every public/pages/*.html file.
 * ar-view.html is excluded (intentionally omits several shared modules).
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

const PAGES_DIR = path.join(__dirname, '../public/pages');
const EXCLUDED = ['ar-view.html'];

// Scripts that must appear in every non-excluded page
const REQUIRED_SCRIPTS = [
  'toast.js',
  'mobile-feedback.js',
  'utils.js',
  'header.js',
  'footer.js',
  'bottom-nav.js',
  'cart.js',
  'tooltip.js'
];

const pageFiles = fs.readdirSync(PAGES_DIR)
  .filter(f => f.endsWith('.html') && !EXCLUDED.includes(f));

let errors = 0;
let warnings = 0;

pageFiles.forEach(file => {
  const src = fs.readFileSync(path.join(PAGES_DIR, file), 'utf8');
  const missing = REQUIRED_SCRIPTS.filter(script => !src.includes(script));
  if (missing.length > 0) {
    console.error(`${colors.red}${file}: missing scripts: ${missing.join(', ')}${colors.reset}`);
    errors++;
  }
});

if (errors === 0) {
  console.log(`${colors.green}Page scripts OK — all required scripts present in ${pageFiles.length} pages${colors.reset}`);
  process.exit(0);
} else {
  console.error(`\n${colors.red}${errors} page(s) have missing required scripts${colors.reset}`);
  process.exit(1);
}
