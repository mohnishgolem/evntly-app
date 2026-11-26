#!/usr/bin/env python3
"""PreToolUse guard for Write/Edit in the vendor acquisition agent.

The agent may only write drafts, reports and test or pilot results. It can
never edit its own definition, hooks, settings, skills, app code or
migrations. Fails closed.
"""
import json
import os
import sys

ALLOWED = (
    "outreach/queue/",
    "outreach/reports/",
    "docs/ai-agents/test-results/",
    "docs/ai-agents/pilot/",
)


def deny(reason):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": "Agent write scope: " + reason,
    }}))
    sys.exit(0)


try:
    data = json.load(sys.stdin)
except Exception:
    deny("could not parse the tool call.")

root = os.path.realpath(os.environ.get("CLAUDE_PROJECT_DIR") or data.get("cwd") or os.getcwd())
path = (data.get("tool_input") or {}).get("file_path") or ""
if not path:
    deny("no file path.")
real = os.path.realpath(path if os.path.isabs(path) else os.path.join(root, path))
rel = os.path.relpath(real, root)
if rel.startswith("..") or os.path.isabs(rel):
    deny(f"{path} is outside the project.")
rel = rel.replace(os.sep, "/")
if not rel.startswith(ALLOWED) or not rel.endswith((".md", ".csv")):
    deny(f"{rel} is not a .md/.csv file under {', '.join(ALLOWED)}.")
sys.exit(0)
