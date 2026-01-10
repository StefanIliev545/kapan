#!/usr/bin/env python3
"""
Completion hook - runs full quality checks when agent finishes.
Triggered by Stop or SubagentStop hooks.
Uses exit code 2 + stderr so Claude sees blocking issues.
"""

import sys
import subprocess
from pathlib import Path
import os

REPO_ROOT = Path(__file__).parent.parent.parent
os.chdir(REPO_ROOT)

def run(cmd, timeout=120):
    """Run command, return (success, output)"""
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=True, text=True,
            timeout=timeout, cwd=REPO_ROOT
        )
        return result.returncode == 0, result.stdout + result.stderr
    except subprocess.TimeoutExpired:
        return False, "Timed out"
    except Exception as e:
        return False, str(e)

def main():
    issues = []

    # 1. ESLint errors only (not warnings)
    success, output = run("yarn next:lint --quiet 2>&1", timeout=60)
    if "error" in output.lower() and "0 errors" not in output.lower():
        import re
        match = re.search(r'(\d+)\s+errors?', output)
        if match and int(match.group(1)) > 0:
            issues.append(f"❌ ESLint: {match.group(1)} error(s)")

    # 2. TypeScript - only check errors in modified files
    modified_files = set()
    success, git_output = run("git diff --name-only HEAD 2>/dev/null", timeout=5)
    if success:
        modified_files = {Path(f).name for f in git_output.strip().split('\n') if f.strip()}

    success, output = run("yarn next:check-types 2>&1", timeout=90)
    if not success:
        error_lines = [l for l in output.split('\n') if 'error TS' in l]
        # Filter to only modified files (if we have git info)
        if modified_files:
            error_lines = [l for l in error_lines if any(f in l for f in modified_files)]
        if error_lines:
            issues.append(f"❌ TypeScript: {len(error_lines)} error(s) in modified files")
            issues.append(f"   {error_lines[0][:100]}")

    # 3. Circular deps (skipped - dpdm-fast not working reliably in yarn scripts)
    # TODO: Fix circular dependency checking

    # 4. Duplicate code (jscpd) - blocking, agent must fix
    success, output = run("npx jscpd packages/nextjs/components --min-tokens 50 --silent 2>&1", timeout=60)
    if "duplicated lines" in output.lower():
        import re
        match = re.search(r'(\d+)\s+exact clones', output)
        if match:
            clone_count = int(match.group(1))
            if clone_count > 0:
                issues.append(f"❌ Duplicates: {clone_count} clones found - fix before completing")

    # All issues are blocking - agent must fix before completing
    if issues:
        print("🔎 Quality check found issues (fix before completing):", file=sys.stderr)
        for issue in issues:
            print(f"  {issue}", file=sys.stderr)
        sys.exit(2)

    # Success - silent
    sys.exit(0)

if __name__ == "__main__":
    main()
