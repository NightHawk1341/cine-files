#!/usr/bin/env node

/**
 * Pre-Commit Verification for Claude
 *
 * This script should be run by Claude before marking any feature as complete.
 * It checks for the most common mistakes Claude makes when implementing features.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

console.log(`${colors.cyan}${colors.bold}Claude Pre-Commit Check${colors.reset}\n`);

const errors = [];
const warnings = [];
let allGood = true;

// Check 1: Are there any new/modified API handlers?
console.log(`${colors.cyan}Checking for new/modified API handlers...${colors.reset}`);
try {
  const gitStatus = execSync('git status --short api/', { encoding: 'utf8' });
  const modifiedFiles = gitStatus
    .split('\n')
    .filter(line => line.trim())
    .map(line => {
      const match = line.match(/^\s*[AM?]\s+(.+)$/);
      return match ? match[1] : null;
    })
    .filter(f => f && f.endsWith('.js'));

  if (modifiedFiles.length > 0) {
    console.log(`${colors.yellow}  Found ${modifiedFiles.length} new/modified handlers:${colors.reset}`);
    modifiedFiles.forEach(f => console.log(`    - ${f}`));

    // Check each one
    console.log(`\n${colors.cyan}Validating each handler...${colors.reset}`);
    modifiedFiles.forEach(file => {
      try {
        execSync(`node scripts/check-new-features.js ${file}`, { encoding: 'utf8' });
        console.log(`${colors.green}  ✓ ${file}${colors.reset}`);
      } catch (error) {
        console.log(`${colors.red}  ✗ ${file}${colors.reset}`);
        errors.push(`Handler ${file} has issues - see output above`);
        allGood = false;
      }
    });
  } else {
    console.log(`${colors.green}  No new API handlers${colors.reset}`);
  }
} catch (error) {
  console.log(`${colors.green}  No changes in api/ directory${colors.reset}`);
}

// Check 2: Did SELECT queries get updated if products table modified?
console.log(`\n${colors.cyan}Checking if products SELECT queries were updated...${colors.reset}`);
try {
  const migrationChanges = execSync('git diff --cached migrations/', { encoding: 'utf8' });

  if (migrationChanges.includes('ALTER TABLE') && migrationChanges.includes('products')) {
    console.log(`${colors.yellow}   Products table migration detected${colors.reset}`);

    // Check if products.js was updated
    const routesChanges = execSync('git diff --cached server/routes/products.js', { encoding: 'utf8' });

    if (!routesChanges || routesChanges.trim().length === 0) {
      errors.push('Products table altered but server/routes/products.js not updated!');
      console.log(`${colors.red}  ✗ server/routes/products.js NOT updated${colors.reset}`);
      console.log(`${colors.red}    You must add new fields to ALL SELECT queries!${colors.reset}`);
      allGood = false;
    } else {
      // Check if all three queries were updated
      const hasMainQuery = routesChanges.includes("router.get('/')");
      const hasSingleQuery = routesChanges.includes("router.get('/:idOrSlug')");
      const hasPublicQuery = routesChanges.includes('publicProductList');

      if (!hasMainQuery && !hasSingleQuery && !hasPublicQuery) {
        warnings.push('Products table altered and products.js updated, but verify ALL SELECT queries include new field');
        console.log(`${colors.yellow}   Verify all 3 SELECT queries updated${colors.reset}`);
      } else {
        console.log(`${colors.green}  ✓ server/routes/products.js updated${colors.reset}`);
      }
    }
  } else {
    console.log(`${colors.green}  No products table migrations${colors.reset}`);
  }
} catch (error) {
  console.log(`${colors.green}  No migration changes${colors.reset}`);
}

// Check 3: Route registration
console.log(`\n${colors.cyan}Checking route registration...${colors.reset}`);
try {
  const indexChanges = execSync('git diff --cached server/routes/index.js', { encoding: 'utf8' });
  const apiChanges = execSync('git status --short api/', { encoding: 'utf8' });

  if (apiChanges && apiChanges.includes('??') && !indexChanges) {
    warnings.push('New API files detected but server/routes/index.js not modified');
    console.log(`${colors.yellow}   New API files but no route changes - verify routes registered${colors.reset}`);
  } else if (indexChanges) {
    console.log(`${colors.green}  ✓ Routes updated${colors.reset}`);
  } else {
    console.log(`${colors.green}  No route changes needed${colors.reset}`);
  }
} catch (error) {
  // Ignore errors
}

// Final summary
console.log(`\n${'='.repeat(60)}`);

if (errors.length > 0) {
  console.log(`${colors.red}${colors.bold}ERRORS FOUND - DO NOT COMMIT YET${colors.reset}\n`);
  errors.forEach((err, i) => {
    console.log(`${colors.red}${i + 1}. ${err}${colors.reset}`);
  });
  console.log('');
}

if (warnings.length > 0) {
  console.log(`${colors.yellow}${colors.bold} WARNINGS${colors.reset}\n`);
  warnings.forEach((warn, i) => {
    console.log(`${colors.yellow}${i + 1}. ${warn}${colors.reset}`);
  });
  console.log('');
}

if (allGood && warnings.length === 0) {
  console.log(`${colors.green}${colors.bold}ALL CHECKS PASSED${colors.reset}`);
  console.log(`${colors.green}Ready to commit!${colors.reset}\n`);
} else if (allGood) {
  console.log(`${colors.yellow}${colors.bold}Checks passed with warnings${colors.reset}`);
  console.log(`${colors.yellow}Review warnings above, then proceed if confident${colors.reset}\n`);
}

console.log(`${'='.repeat(60)}\n`);

process.exit(allGood ? 0 : 1);
