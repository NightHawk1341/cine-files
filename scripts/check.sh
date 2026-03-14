#!/bin/bash
# Validation script for CineFiles — run before completing any task
# Usage: npm run check

set -e

echo "=== CineFiles Validation ==="
echo ""

# 1. Syntax check — server entry point and all API/lib files
echo "[1/3] Checking JavaScript syntax..."
node -c server.js
for f in api/*.js lib/*.js server/**/*.js; do
  [ -f "$f" ] && node -c "$f"
done
echo "Syntax: OK"
echo ""

# 2. Check for hardcoded colors in CSS
echo "[2/3] Checking for hardcoded colors in CSS..."
HARDCODED=$(grep -rn '#[0-9a-fA-F]\{3,8\}' public/css/ 2>/dev/null \
  | grep -v 'var(' \
  | grep -v 'currentColor' \
  | grep -v '/\*' \
  | grep -v 'global.css' \
  || true)

if [ -n "$HARDCODED" ]; then
  echo "WARNING: Possible hardcoded colors found in CSS:"
  echo "$HARDCODED"
  echo ""
  echo "Consider using CSS variables instead."
else
  echo "No hardcoded colors found: OK"
fi
echo ""

# 3. Check that required files exist
echo "[3/3] Checking required files..."
MISSING=""
for f in server.js lib/db.js lib/config.js lib/auth.js lib/storage.js public/index.html public/js/core/router.js; do
  [ ! -f "$f" ] && MISSING="$MISSING  $f\n"
done

if [ -n "$MISSING" ]; then
  echo "ERROR: Missing required files:"
  printf "$MISSING"
  exit 1
else
  echo "Required files: OK"
fi

echo ""
echo "=== Validation complete ==="
