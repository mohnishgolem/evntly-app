#!/usr/bin/env python3
"""PreToolUse guard for file tools in Evntly's engineering agents (Phase 3).

Read / Grep / Glob: refuse credential and config files anywhere
(.env*, ~/.ssh, ~/.aws, ~/.config/gh, ~/.claude, Keychain, .npmrc, .netrc).

Write / Edit (when called with the argument `write`): allow only files inside
a git *worktree* (never the main checkout), and never the worktree's .claude/,
.github/ or .env* files. Fails closed.
"""
import json
import os
import re
import subprocess
import sys

HOME = os.path.realpath(os.path.expanduser("~"))
SECRET = re.compile(r"(^|/)\.env(\.[\w.-]+)?$|(^|/)\.(ssh|aws|netrc|npmrc|pgpass)(/|$)|/\.config/gh(/|$)|"
                    r"^" + re.escape(HOME) + r"/\.claude(/(?!projects/[^/]+/memory(/|$))|$)|"
                    r"/Library/Keychains(/|$)|/\.docker/config\.json$", re.I)


def deny(reason):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse", "permissionDecision": "deny",
        "permissionDecisionReason": "Engineering agent: " + reason}}))
    sys.exit(0)


try:
    data = json.load(sys.stdin)
except Exception:
    deny("could not parse the tool call.")
mode = sys.argv[1] if len(sys.argv) > 1 else "read"
ti = data.get("tool_input") or {}
cwd = data.get("cwd") or os.getcwd()
raw = ti.get("file_path") or ti.get("path") or ti.get("notebook_path") or ""
pattern = ti.get("pattern") or ""

if mode == "read":
    target = raw or cwd
    real = os.path.realpath(target if os.path.isabs(target) else os.path.join(cwd, target))
    if SECRET.search(real) or SECRET.search("/" + pattern.lstrip("/")) or re.search(r"\.env\b", pattern):
        deny(f"{raw or pattern} holds credentials or private config and is off limits.")
    sys.exit(0)

# write mode
if not raw:
    deny("no file path.")
real = os.path.realpath(raw if os.path.isabs(raw) else os.path.join(cwd, raw))
d = os.path.dirname(real)
while d and not os.path.isdir(d):
    d = os.path.dirname(d)


def git(*args):
    r = subprocess.run(["git", "-C", d, *args], capture_output=True, text=True, timeout=10)
    return r.stdout.strip() if r.returncode == 0 else None


top, git_dir, common = git("rev-parse", "--show-toplevel"), git("rev-parse", "--absolute-git-dir"), git("rev-parse", "--path-format=absolute", "--git-common-dir")
if not top or not git_dir or not common:
    deny(f"{raw} is not inside a git repository.")
if os.path.realpath(git_dir) == os.path.realpath(common):
    deny(f"{raw} is in the main checkout. Engineering work happens only in a git worktree.")
rel = os.path.relpath(real, os.path.realpath(top)).replace(os.sep, "/")
if rel.startswith("..") or rel.startswith((".claude/", ".github/")) or re.search(r"(^|/)\.env", rel):
    deny(f"{rel} (agent config, CI workflows and .env files are off limits).")
sys.exit(0)
