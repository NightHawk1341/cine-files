#!/usr/bin/env node

/**
 * Quick Feature Check
 *
 * This script performs quick checks for common mistakes when adding new features.
 * Run this before committing changes to catch issues early.
 *
 * Usage: node scripts/check-new-features.js [handler-path]
 * Example: node scripts/check-new-features.js api/products/authors.js
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

const handlerPath = process.argv[2];

if (!handlerPath) {
  console.log(`${colors.cyan}Usage: node scripts/check-new-features.js <handler-path>${colors.reset}`);
  console.log(`Example: node scripts/check-new-features.js api/products/authors.js\n`);
  console.log('This will check if the handler is properly registered in the router.\n');
  process.exit(0);
}

console.log(`${colors.cyan}Checking: ${handlerPath}${colors.reset}\n`);

// Check 1: Does the handler file exist?
const fullPath = path.join(__dirname, '..', handlerPath);
if (!fs.existsSync(fullPath)) {
  console.log(`${colors.red}Handler file not found: ${fullPath}${colors.reset}\n`);
  process.exit(1);
}
console.log(`${colors.green}✓ Handler file exists${colors.reset}`);

// Check 2: Is it registered in the main router?
const routerPath = path.join(__dirname, '../server/routes/index.js');
const routerContent = fs.readFileSync(routerPath, 'utf8');

// Normalize path for matching
const normalizedPath = handlerPath.replace(/\\/g, '/').replace(/^api\//, '');
const withoutExt = normalizedPath.replace(/\.js$/, '');

const isInRouter = routerContent.includes(normalizedPath) ||
                   routerContent.includes(withoutExt) ||
                   routerContent.includes(path.basename(withoutExt));

if (!isInRouter) {
  console.log(`${colors.red}Handler NOT found in /server/routes/index.js${colors.reset}`);
  console.log(`\n${colors.yellow}Fix:${colors.reset}`);
  console.log(`1. Add to /server/routes/index.js:`);
  console.log(`   const myHandler = require('../../${handlerPath.replace(/\.js$/, '')}');`);
  console.log(`   app.get('/api/...', myHandler); // or app.post, etc.\n`);

  if (handlerPath.startsWith('api/products/')) {
    console.log(`${colors.yellow} This is a product handler!${colors.reset}`);
    console.log(`   Make sure to register it BEFORE the product router (around line 60-74)`);
    console.log(`   to avoid being caught by the /:idOrSlug catch-all route.\n`);
  }

  process.exit(1);
}

console.log(`${colors.green}✓ Handler registered in router${colors.reset}`);

// Check 3: For product handlers, verify it's in the right section
if (handlerPath.startsWith('api/products/')) {
  const productSection = routerContent.substring(
    routerContent.indexOf('PRODUCT-SPECIFIC ROUTES'),
    routerContent.indexOf('PRODUCT ROUTES') + 100
  );

  const inProductSection = productSection.includes(normalizedPath) ||
                           productSection.includes(withoutExt);

  if (!inProductSection) {
    console.log(`${colors.yellow} Warning: Handler might not be in PRODUCT-SPECIFIC ROUTES section${colors.reset}`);
    console.log(`   This could cause issues with the /:idOrSlug catch-all route.\n`);
  } else {
    console.log(`${colors.green}✓ Handler in correct product-specific section${colors.reset}`);
  }
}

// Check 4: If it's a new field, check if SELECT queries are updated
const handlerContent = fs.readFileSync(fullPath, 'utf8');

// Simple heuristic: if handler does INSERT/UPDATE, might be a new field
if (handlerContent.includes('INSERT INTO products') ||
    handlerContent.includes('UPDATE products')) {

  console.log(`\n${colors.cyan} This looks like a product modification handler${colors.reset}`);
  console.log(`${colors.yellow}   Don't forget to update SELECT queries in:${colors.reset}`);
  console.log(`   - /server/routes/products.js (all SELECT statements)`);
  console.log(`   - Include new field in router.get('/') query`);
  console.log(`   - Include new field in router.get('/:idOrSlug') query`);
  console.log(`   - Include new field in publicProductList query\n`);
}

console.log(`${colors.green}\nAll checks passed!${colors.reset}\n`);
