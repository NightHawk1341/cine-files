#!/usr/bin/env node

/**
 * Validation Script: API Route Registration Checker
 *
 * This script checks for common mistakes when adding new API endpoints:
 * 1. API handlers exist but are not registered in router
 * 2. Routes are registered but handler files don't exist
 *
 * Run: node scripts/validate-routing.js
 */

const fs = require('fs');
const path = require('path');

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const issues = [];
const warnings = [];

console.log(`${colors.cyan}TR-BUTE API Route Validation${colors.reset}\n`);

// Step 1: Find all API handler files
console.log(`${colors.blue}Step 1: Scanning API handlers...${colors.reset}`);
const apiHandlers = new Set();

function scanDirectory(dir, basePath = '') {
  const items = fs.readdirSync(dir);

  for (const item of items) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      scanDirectory(fullPath, path.join(basePath, item));
    } else if (item.endsWith('.js')) {
      const handlerPath = path.join(basePath, item).replace(/\\/g, '/');
      apiHandlers.add(handlerPath);
    }
  }
}

scanDirectory(path.join(__dirname, '../api'));
console.log(`  Found ${apiHandlers.size} API handler files\n`);

// Step 2: Check what's registered in the router
console.log(`${colors.blue}Step 2: Checking router registration...${colors.reset}`);
const routerPath = path.join(__dirname, '../server/routes/index.js');
const routerContent = fs.readFileSync(routerPath, 'utf8');

// Extract all require() statements for API handlers
const requireRegex = /require\(['"]\.\.\/\.\.\/api\/([^'"]+)['"]\)/g;
const registeredHandlers = new Set();
let match;

while ((match = requireRegex.exec(routerContent)) !== null) {
  registeredHandlers.add(match[1]);
}

// Also check for handlers registered via other routers
const otherRouters = [
  '../server/routes/products.js',
  '../server/routes/admin.js',
  '../server/routes/feedback.js',
  '../server/routes/sync.js'
];

otherRouters.forEach(routerFile => {
  const routerFilePath = path.join(__dirname, routerFile);
  if (fs.existsSync(routerFilePath)) {
    const content = fs.readFileSync(routerFilePath, 'utf8');
    const matches = content.matchAll(/require\(['"]\.\.\/\.\.\/api\/([^'"]+)['"]\)/g);
    for (const m of matches) {
      registeredHandlers.add(m[1]);
    }
  }
});

console.log(`  Found ${registeredHandlers.size} handlers registered across all routers\n`);

// Step 3: Find unregistered handlers
console.log(`${colors.blue}Step 3: Finding unregistered handlers...${colors.reset}`);
const unregistered = [];

for (const handler of apiHandlers) {
  // Skip index.js files and special cases
  if (handler.endsWith('/index.js') || handler.includes('utils') || handler.includes('helpers')) {
    continue;
  }

  if (!registeredHandlers.has(handler)) {
    unregistered.push(handler);
  }
}

if (unregistered.length > 0) {
  issues.push({
    type: 'UNREGISTERED_HANDLERS',
    message: 'The following API handlers exist but are NOT registered in router:',
    items: unregistered
  });
}

// Step 4: Check for missing handler files
console.log(`${colors.blue}Step 4: Checking for missing handler files...${colors.reset}`);
const missingHandlers = [];

for (const registered of registeredHandlers) {
  const handlerFile = registered.endsWith('.js') ? registered : `${registered}.js`;

  if (!apiHandlers.has(handlerFile)) {
    missingHandlers.push(registered);
  }
}

if (missingHandlers.length > 0) {
  issues.push({
    type: 'MISSING_HANDLERS',
    message: 'The following handlers are registered but files do NOT exist:',
    items: missingHandlers
  });
}

// Step 5: Check product routes specifically
console.log(`${colors.blue}Step 5: Checking product-specific routes...${colors.reset}`);
const productHandlers = Array.from(apiHandlers).filter(h => h.startsWith('products/'));
const productSection = routerContent.substring(
  routerContent.indexOf('PRODUCT-SPECIFIC ROUTES'),
  routerContent.indexOf('PRODUCT ROUTES')
);

for (const handler of productHandlers) {
  const handlerName = path.basename(handler, '.js');

  // Skip special files
  if (['create', 'update', 'reorder', 'links'].includes(handlerName)) {
    continue;
  }

  const isInProductSection = productSection.includes(handler);
  const isRegistered = registeredHandlers.has(handler);

  if (!isRegistered && !isInProductSection) {
    warnings.push({
      type: 'PRODUCT_ROUTE',
      message: `Product handler "${handler}" might need registration before catch-all route`,
      items: [handler]
    });
  }
}

// Step 6: Report results
console.log(`\n${'='.repeat(60)}`);

if (issues.length === 0 && warnings.length === 0) {
  console.log(`${colors.green}All checks passed! No routing issues found.${colors.reset}`);
} else {
  if (issues.length > 0) {
    console.log(`${colors.red}Found ${issues.length} issue(s):${colors.reset}\n`);

    issues.forEach((issue, index) => {
      console.log(`${colors.red}${index + 1}. ${issue.message}${colors.reset}`);
      issue.items.forEach(item => {
        console.log(`   ${colors.yellow}- ${item}${colors.reset}`);
      });
      console.log('');

      if (issue.type === 'UNREGISTERED_HANDLERS') {
        console.log(`   ${colors.cyan}Fix: Add these handlers to /server/routes/index.js${colors.reset}`);
        console.log(`   Example: const handler = require('../../api/${issue.items[0]}');`);
        console.log(`            app.get('/api/...', handler);\n`);
      }
    });
  }

  if (warnings.length > 0) {
    console.log(`${colors.yellow} Found ${warnings.length} warning(s):${colors.reset}\n`);

    warnings.forEach((warning, index) => {
      console.log(`${colors.yellow}${index + 1}. ${warning.message}${colors.reset}`);
      warning.items.forEach(item => {
        console.log(`   - ${item}`);
      });
      console.log('');
    });
  }
}

console.log(`${'='.repeat(60)}\n`);

// Exit with error code if there are issues
if (issues.length > 0) {
  console.log(`${colors.red}Please fix the issues above before deploying.${colors.reset}\n`);
  process.exit(1);
} else if (warnings.length > 0) {
  console.log(`${colors.yellow}Review warnings above. They may or may not need fixing.${colors.reset}\n`);
  process.exit(0);
} else {
  console.log(`${colors.green}Ready to deploy!${colors.reset}\n`);
  process.exit(0);
}
