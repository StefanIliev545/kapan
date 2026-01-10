#!/usr/bin/env python3
"""
FAST post-edit hook using oxlint + per-file TypeScript check.
Uses exit code 2 + stderr for blocking issues so Claude sees them.
Exit code 0 (silent) when all good.
"""

import sys
import json
import subprocess
from pathlib import Path
import os

REPO_ROOT = Path(__file__).parent.parent.parent
os.chdir(REPO_ROOT)

def run(cmd, timeout=10):
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
    try:
        raw_input = sys.stdin.read()
        if not raw_input.strip():
            sys.exit(0)
        hook_input = json.loads(raw_input)
    except:
        sys.exit(0)

    file_path = hook_input.get("tool_input", {}).get("file_path", "")
    if not file_path:
        sys.exit(0)

    path = Path(file_path)
    suffix = path.suffix.lower()

    # Skip non-code files
    if suffix not in [".ts", ".tsx", ".js", ".jsx"]:
        if suffix == ".json":
            try:
                with open(file_path, 'r') as f:
                    json.load(f)
            except json.JSONDecodeError as e:
                print(f"❌ {path.name}: invalid JSON - {e.msg} at line {e.lineno}", file=sys.stderr)
                sys.exit(2)
        sys.exit(0)

    # Skip generated files
    if any(p in file_path for p in ["node_modules", ".next", "typechain-types"]):
        sys.exit(0)

    issues = []

    # 1. Run oxlint (fast!) - no --quiet so we get issue details
    success, output = run(f"./node_modules/.bin/oxlint {file_path} 2>&1", timeout=5)
    if output.strip():
        lines = [l for l in output.split('\n') if l.strip().startswith('!') or l.strip().startswith('  !')]
        for line in lines[:3]:
            issues.append(f"oxlint: {line.strip()[:100]}")

    # 2. Prettier format (fast, silent)
    # Note: TypeScript check is done in on-complete hook (full build needed for accurate results)
    run(f"npx prettier --write {file_path} 2>/dev/null", timeout=5)

    # Only output if there are issues - exit 2 so Claude sees it (blocking)
    if issues:
        print(f"⚠️ {path.name}:", file=sys.stderr)
        for issue in issues:
            print(f"  {issue}", file=sys.stderr)
        sys.exit(2)

    # Success - silent exit
    sys.exit(0)

if __name__ == "__main__":
    main()
