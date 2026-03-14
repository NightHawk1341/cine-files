/**
 * Validate that page-specific CSS files referenced in page scripts
 * actually exist on disk.
 */

const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let errors = 0;

var pagesDir = path.join(__dirname, '..', 'public', 'js', 'pages');
var publicDir = path.join(__dirname, '..', 'public');

function collectFiles(dir) {
  var files = [];
  fs.readdirSync(dir).forEach(function (f) {
    var fullPath = path.join(dir, f);
    if (fs.statSync(fullPath).isDirectory()) {
      files = files.concat(collectFiles(fullPath));
    } else if (f.endsWith('.js')) {
      files.push(fullPath);
    }
  });
  return files;
}

var pageFiles = collectFiles(pagesDir);

pageFiles.forEach(function (filePath) {
  var content = fs.readFileSync(filePath, 'utf8');

  // Find styles arrays in registerPage calls
  var styleMatches = content.match(/styles\s*:\s*\[([^\]]*)\]/g);
  if (!styleMatches) return;

  styleMatches.forEach(function (match) {
    // Extract quoted paths
    var paths = match.match(/['"]([^'"]+)['"]/g);
    if (!paths) return;

    paths.forEach(function (p) {
      var cssPath = p.replace(/['"]/g, '');
      var fullCssPath = path.join(publicDir, cssPath);

      if (!fs.existsSync(fullCssPath)) {
        var relFile = path.relative(path.join(__dirname, '..'), filePath);
        console.error(RED + 'ERROR: ' + relFile + ' references ' + cssPath + ' but file does not exist' + RESET);
        errors++;
      }
    });
  });
});

if (errors === 0) {
  console.log(GREEN + 'SPA page styles: OK' + RESET);
} else {
  process.exit(1);
}
