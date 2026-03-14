/**
 * Validate that all page scripts in public/js/pages/ are included
 * as <script> tags in index.html.
 */

const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

let errors = 0;

var indexHtml = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'index.html'),
  'utf8'
);

// Collect all page JS files
var pagesDir = path.join(__dirname, '..', 'public', 'js', 'pages');

function collectFiles(dir, prefix) {
  var files = [];
  fs.readdirSync(dir).forEach(function (f) {
    var fullPath = path.join(dir, f);
    if (fs.statSync(fullPath).isDirectory()) {
      files = files.concat(collectFiles(fullPath, prefix + f + '/'));
    } else if (f.endsWith('.js')) {
      files.push(prefix + f);
    }
  });
  return files;
}

var pageFiles = collectFiles(pagesDir, '');

pageFiles.forEach(function (f) {
  var scriptPath = '/js/pages/' + f;
  if (indexHtml.indexOf(scriptPath) === -1) {
    console.error(RED + 'ERROR: ' + scriptPath + ' not included in index.html' + RESET);
    errors++;
  }
});

// Also check required shared scripts
var requiredScripts = [
  '/js/utils.js',
  '/js/core/router.js',
  '/js/core/media.js',
  '/js/components/toast.js',
  '/js/components/header.js',
  '/js/components/footer.js',
  '/js/components/bottom-nav.js',
  '/js/components/theme-toggle.js',
];

requiredScripts.forEach(function (s) {
  if (indexHtml.indexOf(s) === -1) {
    console.error(RED + 'ERROR: Required script ' + s + ' not in index.html' + RESET);
    errors++;
  }
});

if (errors === 0) {
  console.log(GREEN + 'Page script inclusion: OK' + RESET);
} else {
  process.exit(1);
}
