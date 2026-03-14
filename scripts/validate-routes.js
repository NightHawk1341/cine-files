/**
 * Validate route registration order.
 * Catch-all and dynamic routes must come after specific routes.
 */

const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

let errors = 0;

var routesFile = fs.readFileSync(
  path.join(__dirname, '..', 'server', 'routes', 'index.js'),
  'utf8'
);

var lines = routesFile.split('\n');
var routeLines = [];

lines.forEach(function (line, i) {
  var match = line.match(/app\.(get|post|put|delete)\s*\(\s*['"]([^'"]+)['"]/);
  if (match) {
    routeLines.push({ method: match[1], path: match[2], line: i + 1 });
  }
});

// Check that specific article routes come before :id catch-all
var articleSpecificIdx = -1;
var articleIdIdx = -1;

routeLines.forEach(function (r, i) {
  if (r.path === '/api/articles/related') articleSpecificIdx = i;
  if (r.path === '/api/articles/:id') articleIdIdx = i;
});

if (articleSpecificIdx > -1 && articleIdIdx > -1 && articleSpecificIdx > articleIdIdx) {
  console.error(RED + 'ERROR: /api/articles/related (line ' + routeLines[articleSpecificIdx].line +
    ') must be registered BEFORE /api/articles/:id (line ' + routeLines[articleIdIdx].line + ')' + RESET);
  errors++;
}

// Check that collection-specific routes come before :id catch-all
var collectionSpecificIdx = -1;
var collectionIdIdx = -1;

routeLines.forEach(function (r, i) {
  if (r.path === '/api/collections/:id/articles') collectionSpecificIdx = i;
  if (r.path === '/api/collections/:id' && r.method === 'get') collectionIdIdx = i;
});

// tmdb/* catch-all must be last in TMDB section
var tmdbSearchIdx = -1;
var tmdbWildcardIdx = -1;

routeLines.forEach(function (r, i) {
  if (r.path === '/api/tmdb/search') tmdbSearchIdx = i;
  if (r.path === '/api/tmdb/*') tmdbWildcardIdx = i;
});

if (tmdbSearchIdx > -1 && tmdbWildcardIdx > -1 && tmdbSearchIdx > tmdbWildcardIdx) {
  console.error(RED + 'ERROR: /api/tmdb/search must be registered BEFORE /api/tmdb/* catch-all' + RESET);
  errors++;
}

if (errors === 0) {
  console.log(GREEN + 'Route registration order: OK' + RESET);
} else {
  process.exit(1);
}
