#!/usr/bin/env python3
"""
Post-edit hook for Claude Code.
FULL PIPELINE - runs all quality tools after every edit.
For beefy machines that don't care about speed.

Receives JSON on stdin with edit details.
Prints feedback that Claude will see.
"""

import sys
import json
import subprocess
from pathlib import Path
import os

# Change to repo root
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
        return False, "Command timed out"
    except Exception as e:
        return False, str(e)

def handle_solidity(file_path):
    """Full Solidity pipeline"""
    actions = []

    # 1. Auto-format
    success, _ = run(f"npx prettier --write {file_path}")
    if success:
        actions.append("✓ Formatted Solidity")

    # 2. Compile check
    success, output = run("yarn hardhat:compile --quiet 2>&1", timeout=120)
    if not success and "error" in output.lower():
        actions.append("❌ Solidity compile FAILED")
        for line in output.split('\n'):
            if 'Error' in line or 'error' in line.lower():
                actions.append(f"   {line.strip()[:120]}")
                break
    else:
        actions.append("✓ Solidity compiles")

    # 3. Check for duplicates in contracts
    success, output = run("npx jscpd packages/hardhat/contracts --reporters console --min-tokens 50 2>&1", timeout=60)
    clone_count = output.count("Clone found")
    if clone_count > 0:
        actions.append(f"⚠️  {clone_count} duplicate block(s) in contracts")

    return actions

def handle_react(file_path):
    """Full React/TypeScript pipeline"""
    actions = []

    # 1. Auto-fix: ESLint
    success, output = run(f"npx eslint --fix {file_path} 2>&1")
    if "error" in output.lower():
        error_count = output.lower().count("error")
        actions.append(f"❌ ESLint: {error_count} error(s) remain")
    else:
        actions.append("✓ ESLint passed/fixed")

    # 2. Auto-fix: Prettier
    success, _ = run(f"npx prettier --write {file_path}")
    if success:
        actions.append("✓ Formatted with Prettier")

    # 3. TypeScript full check
    success, output = run("yarn next:check-types 2>&1", timeout=120)
    if not success:
        error_lines = [l for l in output.split('\n') if 'error TS' in l]
        if error_lines:
            actions.append(f"❌ TypeScript: {len(error_lines)} error(s)")
            actions.append(f"   {error_lines[0][:120]}")
    else:
        actions.append("✓ TypeScript compiles")

    # 4. Duplicate detection (components only for speed)
    if "components" in file_path:
        success, output = run("npx jscpd packages/nextjs/components --reporters console --min-tokens 50 2>&1", timeout=60)
        clone_count = output.count("Clone found")
        if clone_count > 0:
            actions.append(f"⚠️  {clone_count} duplicate block(s) in components")
        else:
            actions.append("✓ No duplicates in components")

    # 5. Circular dependency check
    success, output = run("yarn quality:circular 2>&1", timeout=60)
    if "error" in output.lower() or "circular" in output.lower():
        actions.append("⚠️  Circular dependencies detected")
    else:
        actions.append("✓ No circular deps")

    # 6. Unused exports check (on hooks/utils only for relevance)
    if "/hooks/" in file_path or "/utils/" in file_path:
        success, output = run("npx knip --include exports --no-exit-code 2>&1", timeout=90)
        unused_count = output.lower().count("unused")
        if unused_count > 5:
            actions.append(f"⚠️  ~{unused_count} unused exports detected")

    return actions

def handle_cairo(file_path):
    """Full Cairo pipeline"""
    actions = []

    # 1. Auto-format
    success, _ = run("cd packages/snfoundry/contracts && scarb fmt")
    if success:
        actions.append("✓ Formatted Cairo")

    # 2. Compile
    success, output = run("yarn sncompile 2>&1", timeout=120)
    if not success and "error" in output.lower():
        actions.append("❌ Cairo compile FAILED")
    else:
        actions.append("✓ Cairo compiles")

    # 3. Run tests
    success, output = run("yarn sntest 2>&1", timeout=180)
    if not success:
        actions.append("⚠️  Cairo tests failed")
    else:
        actions.append("✓ Cairo tests pass")

    return actions

def main():
    try:
        hook_input = json.load(sys.stdin)
    except:
        return

    tool_input = hook_input.get("tool_input", {})
    file_path = tool_input.get("file_path", "")

    if not file_path:
        return

    path = Path(file_path)
    suffix = path.suffix.lower()

    # Skip non-code files
    if suffix not in [".sol", ".ts", ".tsx", ".js", ".jsx", ".cairo"]:
        return

    # Skip generated/vendor files
    skip_patterns = ["node_modules", ".next", "typechain-types", "artifacts", "cache"]
    if any(p in file_path for p in skip_patterns):
        return

    print(f"🔧 Running full pipeline for {path.name}...")

    actions = []
    if suffix == ".sol":
        actions = handle_solidity(file_path)
    elif suffix in [".ts", ".tsx", ".js", ".jsx"]:
        actions = handle_react(file_path)
    elif suffix == ".cairo":
        actions = handle_cairo(file_path)

    if actions:
        print("\n".join(actions))

    # Summary
    errors = sum(1 for a in actions if "❌" in a)
    warnings = sum(1 for a in actions if "⚠️" in a)

    if errors > 0:
        print(f"\n🚨 {errors} error(s) need manual fixing")
    elif warnings > 0:
        print(f"\n⚡ All good, {warnings} warning(s) to consider")
    else:
        print(f"\n✅ All checks passed!")

if __name__ == "__main__":
    main()
