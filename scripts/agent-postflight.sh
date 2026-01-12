#!/bin/bash
# Agent Postflight Check
# Run this AFTER making changes to validate before committing
# Usage: ./scripts/agent-postflight.sh [--strict]
#
# Exit codes:
#   0 - Ready to commit
#   1 - Warnings present (can commit with caution)
#   2 - Errors present (do not commit)

set -e
cd "$(dirname "$0")/.."

STRICT_MODE=false
[ "$1" = "--strict" ] && STRICT_MODE=true

echo "🔍 Agent Postflight Check"
echo "========================="

WARNINGS=0
ERRORS=0

# 1. TypeScript must pass
echo ""
echo "[1/5] TypeScript Compilation..."
if yarn next:check-types 2>&1 > /dev/null; then
  echo "✓ TypeScript OK"
else
  echo "❌ TypeScript FAILED"
  ERRORS=$((ERRORS + 1))
fi

# 2. ESLint (errors are blocking, warnings are not)
echo ""
echo "[2/5] ESLint Analysis..."
LINT_OUTPUT=$(yarn next:lint --quiet 2>&1) || true
LINT_ERRORS=$(echo "$LINT_OUTPUT" | grep -c " error " || echo "0")
LINT_WARNINGS=$(echo "$LINT_OUTPUT" | grep -c " warning " || echo "0")
if [ "$LINT_ERRORS" -gt 0 ]; then
  echo "❌ $LINT_ERRORS lint errors"
  ERRORS=$((ERRORS + 1))
elif [ "$LINT_WARNINGS" -gt 0 ]; then
  echo "⚠️  $LINT_WARNINGS lint warnings"
  WARNINGS=$((WARNINGS + 1))
else
  echo "✓ ESLint OK"
fi

# 3. Check for new duplicates in changed files
echo ""
echo "[3/5] Duplicate Code Check..."
CHANGED_FILES=$(git diff --name-only HEAD 2>/dev/null | grep -E '\.(tsx?|jsx?)$' | head -20 || echo "")
if [ -n "$CHANGED_FILES" ]; then
  DUPE_COUNT=$(echo "$CHANGED_FILES" | xargs -I {} npx jscpd {} --reporters console 2>&1 | grep -c "Clone found" || echo "0")
  if [ "$DUPE_COUNT" -gt 0 ]; then
    echo "⚠️  $DUPE_COUNT potential duplicates in changed files"
    WARNINGS=$((WARNINGS + 1))
  else
    echo "✓ No new duplicates"
  fi
else
  echo "✓ No files to check (no staged changes)"
fi

# 4. Solidity compilation (if sol files changed)
echo ""
echo "[4/5] Solidity Check..."
SOL_CHANGED=$(git diff --name-only HEAD 2>/dev/null | grep -c '\.sol$' || echo "0")
if [ "$SOL_CHANGED" -gt 0 ]; then
  if yarn hardhat:compile 2>&1 > /dev/null; then
    echo "✓ Solidity compiles"
  else
    echo "❌ Solidity compilation failed"
    ERRORS=$((ERRORS + 1))
  fi
else
  echo "✓ No Solidity changes"
fi

# 5. Summary
echo ""
echo "[5/5] Summary"
echo "============="
git diff --stat HEAD 2>/dev/null | tail -5 || echo "No changes"

echo ""
if [ "$ERRORS" -gt 0 ]; then
  echo "❌ FAILED: $ERRORS errors, $WARNINGS warnings"
  echo "   Fix errors before committing"
  exit 2
elif [ "$WARNINGS" -gt 0 ]; then
  if [ "$STRICT_MODE" = true ]; then
    echo "⚠️  BLOCKED (strict mode): $WARNINGS warnings"
    exit 1
  else
    echo "⚠️  READY with $WARNINGS warnings"
    echo "   Consider fixing warnings before committing"
    exit 0
  fi
else
  echo "✅ READY: All checks passed"
  exit 0
fi
