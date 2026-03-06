#!/usr/bin/env node
/**
 * validate-router-selectors.js
 * Checks that every contentSelector listed in public/js/core/router.js
 * exists as a class name in at least one public/pages/*.html or public/js/**\/*.js file.
 * Mismatches cause silent page-swap failures in the SPA router.
 * JS files are included because some selectors are set dynamically via className.
 */

const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m'
};

const ROUTER_FILE = path.join(__dirname, '../public/js/core/router.js');
const PAGES_DIR = path.join(__dirname, '../public/pages');
const INDEX_HTML = path.join(__dirname, '../public/index.html');
const JS_DIR = path.join(__dirname, '../public/js');

// Parse contentSelectors array from router.js
const routerSrc = fs.readFileSync(ROUTER_FILE, 'utf8');
const blockMatch = routerSrc.match(/contentSelectors:\s*\[([\s\S]*?)\]/);
if (!blockMatch) {
  console.error(`${colors.red}Could not find contentSelectors in router.js${colors.reset}`);
  process.exit(1);
}

const selectors = [...blockMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1]);

function readDirRecursive(dir, ext) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      results.push(...readDirRecursive(full, ext));
    } else if (f.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

const pageFiles = fs.readdirSync(PAGES_DIR).filter(f => f.endsWith('.html'));
const jsFiles = readDirRecursive(JS_DIR, '.js');

const corpus = [
  ...(fs.existsSync(INDEX_HTML) ? [fs.readFileSync(INDEX_HTML, 'utf8')] : []),
  ...pageFiles.map(f => fs.readFileSync(path.join(PAGES_DIR, f), 'utf8')),
  ...jsFiles.map(f => fs.readFileSync(f, 'utf8'))
].join('\n');

let errors = 0;
selectors.forEach(selector => {
  if (!selector.startsWith('.')) return; // skip non-class selectors
  const className = selector.slice(1);
  // Match className as a standalone word anywhere in the corpus (class attr or className assignment)
  const pattern = new RegExp(`\\b${className}\\b`);
  if (!pattern.test(corpus)) {
    console.error(`${colors.red}Selector mismatch: '${selector}' in router.js contentSelectors not found in HTML or JS${colors.reset}`);
    errors++;
  }
});

if (errors === 0) {
  console.log(`${colors.green}Router selectors OK — all ${selectors.length} contentSelectors found in HTML/JS${colors.reset}`);
  process.exit(0);
} else {
  process.exit(1);
}
