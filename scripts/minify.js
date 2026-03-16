#!/usr/bin/env node

/**
 * Minify all CSS and JS files in public/ using esbuild.
 * Runs during deployment only — source files in git stay readable.
 *
 * Usage:
 *   node scripts/minify.js            # minify in-place
 *   node scripts/minify.js --dry-run  # preview savings without modifying files
 */

var fs = require('fs');
var path = require('path');
var esbuild = require('esbuild');

var PUBLIC_DIR = path.join(__dirname, '..', 'public');
var SKIP_DIRS = ['fonts'];
var dryRun = process.argv.includes('--dry-run');

function collectFiles(dir, extensions) {
  var results = [];
  var entries = fs.readdirSync(dir, { withFileTypes: true });

  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (SKIP_DIRS.indexOf(entry.name) === -1) {
        results = results.concat(collectFiles(fullPath, extensions));
      }
    } else if (entry.isFile()) {
      var ext = path.extname(entry.name).toLowerCase();
      if (extensions.indexOf(ext) !== -1) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

async function minifyFiles() {
  var files = collectFiles(PUBLIC_DIR, ['.js', '.css']);

  if (files.length === 0) {
    console.log('No files found to minify.');
    return;
  }

  var totalOriginal = 0;
  var totalMinified = 0;
  var processed = 0;
  var errors = 0;

  console.log(dryRun ? 'DRY RUN — no files will be modified\n' : 'Minifying files...\n');

  for (var i = 0; i < files.length; i++) {
    var filePath = files[i];
    var relativePath = path.relative(PUBLIC_DIR, filePath);
    var ext = path.extname(filePath).toLowerCase();

    try {
      var source = fs.readFileSync(filePath, 'utf8');
      var originalSize = Buffer.byteLength(source, 'utf8');

      var loader = ext === '.css' ? 'css' : 'js';
      var result = await esbuild.transform(source, {
        minify: true,
        legalComments: 'inline',
        loader: loader,
      });

      var minifiedSize = Buffer.byteLength(result.code, 'utf8');
      var savings = originalSize - minifiedSize;
      var pct = originalSize > 0 ? ((savings / originalSize) * 100).toFixed(1) : '0.0';

      totalOriginal += originalSize;
      totalMinified += minifiedSize;

      if (savings > 0) {
        console.log(
          '  ' + relativePath + ': ' +
          formatSize(originalSize) + ' -> ' + formatSize(minifiedSize) +
          ' (-' + pct + '%)'
        );

        if (!dryRun) {
          fs.writeFileSync(filePath, result.code, 'utf8');
        }
      }

      processed++;
    } catch (err) {
      console.error('  ERROR ' + relativePath + ': ' + err.message);
      errors++;
    }
  }

  var totalSavings = totalOriginal - totalMinified;
  var totalPct = totalOriginal > 0 ? ((totalSavings / totalOriginal) * 100).toFixed(1) : '0.0';

  console.log('\n--- Summary ---');
  console.log('Files processed: ' + processed + (errors > 0 ? ' (' + errors + ' errors)' : ''));
  console.log('Total: ' + formatSize(totalOriginal) + ' -> ' + formatSize(totalMinified) + ' (-' + totalPct + '%)');

  if (dryRun) {
    console.log('\nRun without --dry-run to apply changes.');
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  return (bytes / 1024).toFixed(1) + ' KB';
}

minifyFiles().catch(function (err) {
  console.error('Minification failed:', err);
  process.exit(1);
});
