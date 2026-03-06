#!/usr/bin/env node
/**
 * validate-routes.js
 * Verifies that product-specific routes (/api/products/search, /api/products/authors, etc.)
 * are registered BEFORE app.use('/api/products', productRouter) in server/routes/index.js.
 * The productRouter has a /:idOrSlug catch-all that silently swallows anything after it.
 */

const fs = require('fs');
const path = require('path');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m'
};

const INDEX_FILE = path.join(__dirname, '../server/routes/index.js');
const src = fs.readFileSync(INDEX_FILE, 'utf8');
const lines = src.split('\n');

// Find the line index where app.use('/api/products', ...) is registered
const catchAllLine = lines.findIndex(l =>
  /app\.use\(['"]\/api\/products['"]\s*,/.test(l)
);

if (catchAllLine === -1) {
  console.error(`${colors.red}Could not find app.use('/api/products', ...) in server/routes/index.js${colors.reset}`);
  process.exit(1);
}

// Find all specific /api/products/* route registrations
const specificRoutePattern = /app\.(get|post|put|patch|delete)\(['"]\/api\/products\/[^:]/;
let errors = 0;

lines.forEach((line, idx) => {
  if (specificRoutePattern.test(line) && idx > catchAllLine) {
    const routeMatch = line.match(/['"]\/api\/products\/[^'"]+['"]/);
    const routePath = routeMatch ? routeMatch[0] : line.trim();
    console.error(`${colors.red}Route ordering error: ${routePath} (line ${idx + 1}) is registered AFTER app.use('/api/products') (line ${catchAllLine + 1}) and will be unreachable${colors.reset}`);
    errors++;
  }
});

if (errors === 0) {
  console.log(`${colors.green}Route order OK — all /api/products/* specific routes registered before catch-all${colors.reset}`);
  process.exit(0);
} else {
  process.exit(1);
}
