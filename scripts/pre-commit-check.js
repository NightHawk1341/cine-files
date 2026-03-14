/**
 * Pre-commit verification script.
 * Checks that new API files are registered in routes and validates JS syntax.
 */

const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let errors = 0;
let warnings = 0;

function error(msg) {
  console.error(RED + 'ERROR: ' + msg + RESET);
  errors++;
}

function warn(msg) {
  console.warn(YELLOW + 'WARNING: ' + msg + RESET);
  warnings++;
}

function ok(msg) {
  console.log(GREEN + 'OK: ' + msg + RESET);
}

// 1. Check that all api/*.js files are required in server/routes/index.js
var routesFile = fs.readFileSync(path.join(__dirname, '..', 'server', 'routes', 'index.js'), 'utf8');
var apiDir = path.join(__dirname, '..', 'api');
var apiFiles = fs.readdirSync(apiDir).filter(function (f) {
  return f.endsWith('.js') && !f.startsWith('_');
});

apiFiles.forEach(function (f) {
  var baseName = f.replace('.js', '');
  // Check if the file is required in routes
  if (routesFile.indexOf("'" + '../../api/' + baseName + "'") === -1 &&
      routesFile.indexOf('"../../api/' + baseName + '"') === -1) {
    error('api/' + f + ' is not registered in server/routes/index.js');
  }
});

if (errors === 0) {
  ok('All API files registered in routes');
}

// 2. Syntax check all JS files
var dirsToCheck = ['api', 'lib', 'server/routes', 'server/middleware', 'server/services', 'server/utils'];
dirsToCheck.forEach(function (dir) {
  var fullDir = path.join(__dirname, '..', dir);
  if (!fs.existsSync(fullDir)) return;
  var files = fs.readdirSync(fullDir).filter(function (f) { return f.endsWith('.js'); });
  files.forEach(function (f) {
    try {
      var content = fs.readFileSync(path.join(fullDir, f), 'utf8');
      // Basic syntax check — try to parse
      new Function(content);
    } catch (e) {
      error('Syntax error in ' + dir + '/' + f + ': ' + e.message);
    }
  });
});

// 3. Check server.js syntax
try {
  var serverContent = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  new Function(serverContent);
  ok('server.js syntax valid');
} catch (e) {
  error('Syntax error in server.js: ' + e.message);
}

console.log('');
if (errors > 0) {
  console.log(RED + errors + ' error(s) found' + RESET);
  process.exit(1);
} else {
  console.log(GREEN + 'Pre-commit check passed' + RESET);
}
