#!/usr/bin/env python3
"""Pipe tests for .claude/hooks/eng-bash-guard.py. Nothing is executed: each
command is only sent to the guard as JSON.

Run: python3 -I docs/ai-agents/test-fixtures/eng-bash-guard-test.py [guard.py]
"""
import json
import os
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.abspath(__file__)) + "/../../.."
GUARD = sys.argv[1] if len(sys.argv) > 1 else ROOT + "/.claude/hooks/eng-bash-guard.py"
W = "/Users/x/evntly-app/.claude/worktrees/agent-1"
Q = '"/Users/x/Library/Application Support/wt"'

DENY = [
    # activation-test probes
    "git push origin HEAD", "cat .env.local", "curl -s https://example.com",
    "npm install left-pad", "supabase status", "printenv",
    # git global options in front of the subcommand
    f"git -C {W} push origin HEAD", f"git -C {W} push --dry-run origin HEAD",
    f"git -C {Q} push", "git -c core.x=y push origin HEAD", "git --no-pager push",
    "git --git-dir=.git push", "git --git-dir .git --work-tree . push",
    f"cd {W} && git -C {W} push", f"/usr/bin/git -C {W} push", 'git "push"', "\\git -C . push",
    "git status; git -C . push", "git status\ngit -C . push", "git -C . \\\n push",
    "(git -C . push)", "echo $(git -C . push)", 'echo "$(git -C . push)"', "echo `git -C . push`",
    'bash -c "git -C . push"', "sh -lc 'git --no-pager push'", "env git -C . push",
    "git -C . send-pack origin HEAD", "git -c alias.p=push p", "git config alias.p push",
    "git -C . reset --hard", "git -C . switch main", "git -C . checkout master",
    "git -C . branch -D x", "git -C . remote add o url", "git -C . clean -fd",
    "git -c user.name=x commit -m y", "git -C . config user.email x@y.z",
    # comments and heredocs must not hide the next command
    "# don't\ngit -C . push", "cat <<'EOF'\nit's\nEOF\ngit -C . push",
    # package installs with flags
    "npm install --dry-run left-pad", "npm install --save left-pad", "npm i -D left-pad",
    "npm add --save-dev left-pad", "npm --prefix . install left-pad", "npm install left-pad --save",
    "npm in left-pad", "npm isntall left-pad", "pnpm add -D left-pad", "pnpm i --filter web left-pad",
    "yarn add --dev left-pad", "yarn global add left-pad", "bun add -d left-pad",
    f"cd {W} && npm install --no-save left-pad 2>&1 | tail -5", 'npm install -E "left-pad"',
    'bash -c "npm i -D left-pad"',
    # wrappers, substitutions and continuations
    "if true; then git -C . push; fi", "timeout 5 git -C . push", "find . -maxdepth 0 -exec git -C . push ;",
    'echo "`git -C . push`"', 'x="$(npm i -D left-pad)"', "pnpm add -w left-pad",
    "npm install \\\n left-pad", "npm install \\\n -D left-pad", "yarn workspace web add -D left-pad",
    "npm install -- left-pad", "npm install >log left-pad", "git status # it's fine\ngit -C . push",
    # inline shells, interpreters, spawning, git hooks
    'bash -lc "git status"', "sh -s < x", "bash <<'EOF'\nls\nEOF", "source x.sh", ". ./x.sh",
    "node -e 'console.log(1)'", "python3 -c 'print(1)'", "awk -e 'BEGIN{}'",
    "git commit --no-verify -m x", "rm .git/hooks/pre-push", "git -c core.hooksPath=/dev/null commit -m x",
    "docker exec -i other psql", "psql -h db", "curl http://localhost:3000 https://example.com",
    "FOO=1 supabase status", "env supabase status", ">/dev/null supabase status", "if true; then supabase status; fi",
]

ALLOW = [
    "git status --short", f"git -C {W} status --short", f"git -C {Q} diff main...HEAD",
    "git --no-pager log --oneline -5", "git -C . switch -c feat/x", "git -C . add -A",
    'git -C . commit -m "Fix push notification settings"', "git stash push -u -m tag",
    "git rev-parse --path-format=absolute --git-common-dir", "git -c core.quotepath=off status",
    "npm ci", "npm install", "npm install --no-audit --no-fund", "npm install 2>&1 | tail -20",
    "npm install --omit dev", "npm ci && npx vitest run", "npm run lint", "npm test -- add",
    "npm run build 2>&1 | grep add", "npm ls left-pad", "pnpm install --frozen-lockfile",
    "npm install\necho done", "npx tsc --noEmit", "grep -rn 'push' src",
    "git -C . commit -F - <<'EOF'\nFix the vendor's form\nEOF",
    "git commit -m \"$(cat <<'EOF'\nFix the vendor's form (mobile)\n\nCo-Authored-By: A <a@b.c>\nEOF\n)\"",
    "npx vitest run", "npx tsc --noEmit", "npx eslint src", "npx next typegen",
    "npm run dev", "npm run build", "npm run start", "npm run lint", "npm run copy-maplibre-worker",
    "npm run predev", "npm run prebuild", "npm run test", "npm test", "npm run typecheck", "npm run test:security",
    "git add src && git commit -m 'Fix (mobile): spacing; tidy'", 'git commit -m "fix(ui): a; b (c)"',
    "git switch -c feat/x", "git diff --stat", "rg -n 'push' src", "ls -la",
    "docker exec -i supabase_db_evntly-qa psql -U postgres -d postgres", "curl http://localhost:3000",
    ".claude/bin/ro-sql preflight",
    "npm install > install.log 2>&1", "npm ci 2>&1 | tail -3", "yarn install", "git -C . log --grep add",
]


def refused(cmd, cwd=None):
    r = subprocess.run(["python3", "-I", GUARD], capture_output=True, text=True,
                       cwd=ROOT,
                       input=json.dumps({"tool_name": "Bash", "tool_input": {"command": cmd}, "cwd": cwd or ROOT}))
    if r.returncode != 0:
        raise SystemExit(f"guard crashed on {cmd!r}: {r.stderr}")
    return '"deny"' in r.stdout


failures = [("should refuse", c) for c in DENY if not refused(c)]
failures += [("should allow", c) for c in ALLOW if refused(c)]
# Scripts are found from the agent's directory, which is not the hook's own.
with tempfile.TemporaryDirectory() as d:
    os.makedirs(d + "/scripts")
    files = {"scripts/probe-push.sh": "#!/bin/sh\ngit -C . push --dry-run origin HEAD\n",
             "scripts/add.sh": "#!/bin/sh\n# it's fine\nnpm i -D left-pad\n",
             "scripts/spawn.mjs": "import 'node:child_process'\n",
             "scripts/ok.sh": "#!/bin/sh\nnpx vitest run\n",
             "package.json": json.dumps({"scripts": {"ship": "git push"}})}
    for name, body in files.items():
        open(d + "/" + name, "w").write(body)
    cases = [(c, d, True) for c in ("bash scripts/probe-push.sh", "./scripts/probe-push.sh", "sh scripts/add.sh",
                                    "node scripts/spawn.mjs", "npm run ship")]
    cases += [(c, ROOT, True) for c in (f"cd {d} && bash scripts/probe-push.sh", f"cd {d}/scripts; ./probe-push.sh",
                                        f"cd {d} && npm run ship")]
    cases += [("bash scripts/ok.sh", d, False)]
    for c, where, want in cases:
        if refused(c, where) != want:
            failures.append(("should refuse" if want else "should allow", c))
total = len(DENY) + len(ALLOW) + len(cases)

for kind, c in failures:
    print(f"FAIL {kind}: {c!r}")
print(f"{total - len(failures)} passed, {len(failures)} failed")
sys.exit(1 if failures else 0)
