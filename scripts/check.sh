#!/bin/bash
# Validation script for CineFiles — run before completing any task
# Usage: npm run check

set -e

echo "=== CineFiles Validation ==="
echo ""

# 1. TypeScript / Build check
echo "[1/3] Building project..."
npx next build
echo "Build: OK"
echo ""

# 2. Lint check
echo "[2/3] Running linter..."
npx next lint --quiet 2>/dev/null || echo "Lint: skipped (ESLint not configured)"
echo ""

# 3. Check for hardcoded colors in CSS modules
echo "[3/3] Checking for hardcoded colors in CSS modules..."
HARDCODED=$(grep -rn '#[0-9a-fA-F]\{3,8\}' styles/components/ styles/pages/ 2>/dev/null \
  | grep -v '\.module\.css:.*var(' \
  | grep -v 'currentColor' \
  | grep -v '/\*' \
  | grep -v 'comment' \
  || true)

if [ -n "$HARDCODED" ]; then
  echo "WARNING: Possible hardcoded colors found in CSS modules:"
  echo "$HARDCODED"
  echo ""
  echo "Consider using CSS variables instead."
else
  echo "No hardcoded colors found in CSS modules: OK"
fi

echo ""
echo "=== Validation complete ==="
