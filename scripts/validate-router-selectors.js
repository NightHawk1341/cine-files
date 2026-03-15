/**
 * Validate that SPA router content selectors referenced in page scripts
 * exist in index.html.
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

// Check that page-content container exists
if (indexHtml.indexOf('id="page-content"') === -1) {
  console.error(RED + 'ERROR: #page-content container missing in index.html' + RESET);
  errors++;
}

// Check that persistent layout elements exist (by id or class)
var requiredElements = [
  { selector: 'site-header', desc: 'Header' },
  { selector: 'footer-content', desc: 'Footer' },
  { selector: 'bottom-nav', desc: 'Bottom navigation' },
  { selector: 'scroll-to-top', desc: 'Scroll to top button' },
];

requiredElements.forEach(function (el) {
  if (indexHtml.indexOf('id="' + el.selector + '"') === -1 &&
      indexHtml.indexOf("id='" + el.selector + "'") === -1 &&
      indexHtml.indexOf('class="' + el.selector + '"') === -1 &&
      indexHtml.indexOf('class="' + el.selector) === -1) {
    console.error(RED + 'ERROR: ' + el.selector + ' (' + el.desc + ') missing in index.html' + RESET);
    errors++;
  }
});

if (errors === 0) {
  console.log(GREEN + 'Router content selectors: OK' + RESET);
} else {
  process.exit(1);
}
