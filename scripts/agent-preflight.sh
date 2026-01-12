#!/bin/bash
# Agent Preflight Check
# Run this BEFORE making changes to ensure clean starting state
# Usage: ./scripts/agent-preflight.sh

set -e
cd "$(dirname "$0")/.."

echo "🔍 Agent Preflight Check"
echo "========================"

# 1. Check git status
echo ""
echo "📦 Git Status:"
if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️  Working directory has uncommitted changes:"
  git status --short
else
  echo "✓ Working directory clean"
fi

# 2. Check TypeScript compiles
echo ""
echo "📝 TypeScript Check:"
if yarn next:check-types 2>&1 > /dev/null; then
  echo "✓ TypeScript compiles"
else
  echo "❌ TypeScript errors - fix before proceeding"
  exit 1
fi

# 3. Quick lint check
echo ""
echo "🔧 Lint Status:"
LINT_ERRORS=$(yarn next:lint --quiet 2>&1 | grep -c "error" || echo "0")
if [ "$LINT_ERRORS" -gt 0 ]; then
  echo "⚠️  $LINT_ERRORS lint errors exist"
else
  echo "✓ No blocking lint errors"
fi

# 4. Show available issues
echo ""
echo "📋 Available Work:"
bd ready 2>/dev/null || echo "(bd not configured)"

echo ""
echo "✅ Preflight complete - ready for changes"
