#!/bin/bash
# Comprehensive code quality check script for CI and agent use
# Run with: ./scripts/quality-check.sh [--fix] [--report]
#
# Exit codes:
#   0 - All checks passed
#   1 - Quality issues found (non-blocking warnings)
#   2 - Critical issues found (blocking errors)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

FIX_MODE=false
REPORT_MODE=false
ISSUES_FOUND=0
CRITICAL_ISSUES=0

# Parse arguments
for arg in "$@"; do
  case $arg in
    --fix) FIX_MODE=true ;;
    --report) REPORT_MODE=true ;;
  esac
done

# Create output directory for reports
mkdir -p .quality

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Code Quality Check Suite${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 1. TypeScript type checking
echo -e "${YELLOW}[1/6] TypeScript Type Check${NC}"
if yarn next:check-types 2>&1; then
  echo -e "${GREEN}✓ TypeScript types OK${NC}"
else
  echo -e "${RED}✗ TypeScript errors found${NC}"
  CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
fi
echo ""

# 2. ESLint (includes sonarjs rules)
echo -e "${YELLOW}[2/6] ESLint Analysis${NC}"
if [ "$FIX_MODE" = true ]; then
  yarn next:lint --fix 2>&1 || true
else
  if yarn next:lint 2>&1; then
    echo -e "${GREEN}✓ ESLint passed${NC}"
  else
    echo -e "${YELLOW}! ESLint warnings found${NC}"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
  fi
fi
echo ""

# 3. Duplicate code detection
echo -e "${YELLOW}[3/6] Duplicate Code Detection (jscpd)${NC}"
JSCPD_OUTPUT=$(npx jscpd packages/nextjs/components --reporters console 2>&1) || true
CLONE_COUNT=$(echo "$JSCPD_OUTPUT" | grep -c "Clone found" || echo "0")
if [ "$CLONE_COUNT" -gt 0 ]; then
  echo -e "${YELLOW}! Found $CLONE_COUNT code duplicates${NC}"
  if [ "$REPORT_MODE" = true ]; then
    echo "$JSCPD_OUTPUT" > .quality/duplicates.txt
    echo "  Report saved to .quality/duplicates.txt"
  fi
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
  echo -e "${GREEN}✓ No significant duplicates${NC}"
fi
echo ""

# 4. Circular dependency check
echo -e "${YELLOW}[4/6] Circular Dependency Check (dependency-cruiser)${NC}"
CIRCULAR=$(npx depcruise --config .dependency-cruiser.js --output-type err packages/nextjs/components 2>&1) || true
if echo "$CIRCULAR" | grep -qE "(circular|error)"; then
  echo -e "${YELLOW}! Circular dependencies or issues found${NC}"
  if [ "$REPORT_MODE" = true ]; then
    echo "$CIRCULAR" > .quality/circular-deps.txt
    echo "  Report saved to .quality/circular-deps.txt"
  fi
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
  echo -e "${GREEN}✓ No circular dependencies${NC}"
fi
echo ""

# 5. Unused exports/dependencies (knip) - warning only
echo -e "${YELLOW}[5/6] Unused Code Detection (knip)${NC}"
KNIP_OUTPUT=$(npx knip --no-exit-code 2>&1) || true
if echo "$KNIP_OUTPUT" | grep -qE "(unused|Unused)"; then
  echo -e "${YELLOW}! Potential unused code found${NC}"
  if [ "$REPORT_MODE" = true ]; then
    echo "$KNIP_OUTPUT" > .quality/unused-code.txt
    echo "  Report saved to .quality/unused-code.txt"
  fi
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
  echo -e "${GREEN}✓ No obvious unused code${NC}"
fi
echo ""

# 6. Hardhat compile check
echo -e "${YELLOW}[6/6] Solidity Compilation${NC}"
if yarn hardhat:compile 2>&1 | tail -5; then
  echo -e "${GREEN}✓ Solidity compilation OK${NC}"
else
  echo -e "${RED}✗ Solidity compilation failed${NC}"
  CRITICAL_ISSUES=$((CRITICAL_ISSUES + 1))
fi
echo ""

# Summary
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   Summary${NC}"
echo -e "${BLUE}========================================${NC}"

if [ "$CRITICAL_ISSUES" -gt 0 ]; then
  echo -e "${RED}✗ $CRITICAL_ISSUES critical issues (blocking)${NC}"
  echo -e "${YELLOW}! $ISSUES_FOUND warnings (non-blocking)${NC}"
  exit 2
elif [ "$ISSUES_FOUND" -gt 0 ]; then
  echo -e "${GREEN}✓ No critical issues${NC}"
  echo -e "${YELLOW}! $ISSUES_FOUND warnings to address${NC}"
  exit 1
else
  echo -e "${GREEN}✓ All quality checks passed!${NC}"
  exit 0
fi
