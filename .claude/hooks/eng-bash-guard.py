#!/usr/bin/env python3
"""PreToolUse guard for Bash in Evntly's engineering agents (Phase 3).

A speed bump, not a sandbox: the real protections are that code work runs in
a git worktree with no .env files, credentials are unreadable (see
eng-path-guard.py), and nothing is pushed, merged or deployed by an agent.
This guard refuses the commands that would publish, deploy, spend, change
production or reach credentials. Fails closed on anything it can't parse.
"""
import json
import os
import re
import shlex
import sys

RULES = [
    # Publishing and merging code
    (r"\bgit\s+push\b", "git push (Sai pushes after review)"),
    (r"\bgh\s+(pr\s+(create|merge|close|edit|ready|review)|release|repo\s+(create|delete|edit)|secret|variable|workflow\s+run|api\b)", "GitHub changes via gh"),
    (r"\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f|checkout\s+(main|master)\b|switch\s+(main|master)\b|branch\s+-[dD]\b|tag\b|filter-branch|rebase\b.*\b(main|master)\b)", "destructive or main-branch git operation"),
    (r"\bgit\s+.*\bconfig\b.*\b(user\.|credential|remote\.)", "changing git identity, credentials or remotes"),
    (r"\bgit\s+remote\s+(add|set-url|remove)", "changing git remotes"),
    # Deploying and production
    (r"\b(vercel|netlify|flyctl|fly)\b", "deploy tooling"),
    (r"(^|[;&|(]\s*|\bnpx\s+(-y\s+)?|\bnpm\s+exec\s+|/s?bin/)supabase(\s|$)","Supabase CLI (migrations are written as files, never applied by agents)"),
    (r"\b(postgres(ql)?://|db\.[a-z0-9]{20}\.supabase)", "a database connection string"),
    (r"(api\.supabase\.com|supabase\.co\b|pooler\.supabase|api\.vercel\.com|vercel\.app|api\.stripe\.com|graph\.facebook\.com|metricool|api\.resend\.com|hooks\.slack)", "network call to a production service"),
    # Credentials and secrets
    (r"(^|[\s/'\"=])\.env(\.[\w.-]+)?\b", ".env files"),
    (r"\b(security\s+(find|dump|export|delete)|keychain|printenv|set-agent-db-password)\b", "Keychain or environment secrets"),
    (r"(^|[;&|]\s*)env(\s*$|\s*[;&|])", "dumping the environment"),
    (r"(~|/Users/[^/\s]+)/\.(ssh|aws|config/gh|claude|netrc|npmrc|docker)\b", "credential or config directories"),
    (r"\bSUPABASE_SERVICE_ROLE|SERVICE_ROLE_KEY|STRIPE_SECRET|RESEND_API_KEY|\$\{?[A-Z_]*(SECRET|TOKEN|KEY|PASSWORD)\b", "secret environment variables"),
    # Installing third-party code (needs Sai's approval)
    (r"\b(npm|pnpm|yarn|bun)[ \t]+(i|install|add)[ \t]+(?!-|\d*[<>&])[\w@/.-]+", "installing a new package"),
    (r"\b(npm|pnpm|yarn)\s+(publish|login|adduser|token)\b", "npm publish/login"),
    (r"\bnpx\s+(?!(-y\s+)?(vitest|tsc|eslint|next|prettier|playwright\s+test)\b)", "npx of anything but vitest/tsc/eslint/next/prettier"),
    (r"\b(pip3?|brew|gem|cargo)\s+install\b", "installing software"),
    (r"(curl|wget)[^|]*\|\s*(ba|z)?sh", "piping a download into a shell"),
    # Escaping the guard
    (r"\b(ba|z|da|k|fi)?sh\s+(-[a-zA-Z]*c\b|-s\b|<<)|\bsource\s|(^|[;&|]\s*)\.\s+\S", "inline shells (`sh -c`, `bash -lc`, sourcing): run commands directly"),
    (r"\b(python3?|node|perl|ruby|deno|bun|php|osascript|awk|gawk)\s+(-[a-zA-Z]*[ce]\b|--eval\b|-r\b)|\b(npx\s+)?tsx\s+-e\b", "inline interpreter code (python -c, node -e, …): write a script file in the worktree instead"),
    (r"\b(system|popen|execSync|spawnSync|execFileSync|spawn|exec)\s*\(|child_process|subprocess|os\.system|\bShell\.run", "spawning commands from code"),
    (r"\.git/(hooks|config|info)\b|\bcore\.hooksPath\b|--no-verify\b", "changing git hooks or bypassing them"),
    (r"\beval\s|(^|[;&|(]\s*)exec\s|\bbase64\s+(-d|--decode|-D)|\bsudo\b|\bchmod\s+[0-7]*7[0-7]*\s+/|\bosascript\b", "eval/exec, decoding, sudo or AppleScript"),
    (r"(^|\s)rm\s+-[a-z]*r[a-z]*f?\s+(/|~|\$HOME|\.\.)", "recursive delete outside the worktree"),
    (r"\.claude/(hooks|agents|settings|bin|mcp)", "editing agent config, hooks or connectors"),
]
COMPILED = [(re.compile(p, re.I), why) for p, why in RULES]


def deny(reason):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse", "permissionDecision": "deny",
        "permissionDecisionReason": "Engineering agent: " + reason + " is not allowed. Put it in Waiting for Sai."}}))
    sys.exit(0)


try:
    data = json.load(sys.stdin)
    cmd = str((data.get("tool_input") or {}).get("command") or "")
except Exception:
    deny("an unparseable command")
if not cmd.strip():
    deny("an empty command")
# Allow the read-only SQL runner explicitly (it checks its own role and guard).
if re.fullmatch(r"\s*(cd\s+\S+\s*&&\s*)?(\S*/)?\.claude/bin/ro-sql\s+(preflight|\S+\.sql|-)\s*(<\s*\S+)?\s*", cmd):
    sys.exit(0)
# git options that take a value as the next word.
GIT_VALUE_FLAGS = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path",
                   "--config-env", "--attr-source", "-R", "--repo", "--hostname"}
# `-c key=value` can alias `push`, change identity or swap the transport.
GIT_BAD_CONFIG = re.compile(r"(alias\.|user\.|credential|remote\.|url\.|core\.(sshcommand|hookspath))", re.I)
# Package-manager options that take a value as the next word.
PKG_VALUE_FLAGS = {"--prefix", "-C", "--dir", "--cwd", "--workspace", "--filter", "-F", "--registry",
                   "--userconfig", "--globalconfig", "--cache", "--loglevel", "--omit", "--include",
                   "--tag", "--otp", "--before", "--install-strategy", "--location", "--depth"}
INSTALL_WORDS = {"i", "in", "ins", "inst", "insta", "instal", "install", "isnt", "isnta", "isntal",
                 "isntall", "install-test", "it", "add"}


def split_commands(command):
    """Split a shell command into simple commands (lists of words). Newlines and
    operators separate commands; redirections and their targets are dropped. If
    quoting can't be parsed (an apostrophe in a heredoc or comment), drop every
    quote and check each line as if it were a command."""
    command = command.replace("\\\n", " ").replace("`", " ; ")
    try:
        lex = shlex.shlex(command, posix=True, punctuation_chars="();<>|&\n")
        lex.whitespace = " \t\r"
        lex.whitespace_split = True
        lex.commenters = ""
        tokens = list(lex)
    except ValueError:
        tokens = re.findall(r"[&|;()<>\n]+|[^\s&|;()<>]+", re.sub(r"['\"\\]", "", command))
    segments, cur, skip = [], [], False
    for tok in tokens:
        if set(tok) <= set("&|;()<>\n") and tok:
            if re.search(r"[<>]", tok) and not re.search(r"[;|()\n]", tok):
                if cur and cur[-1].isdigit():
                    cur.pop()  # the 2 in 2>&1
                skip = True
                continue
            segments.append(cur)
            cur, skip = [], False
        elif skip:
            skip = False
        else:
            cur.append(tok[1:] if tok.startswith("$(") else tok)
    segments.append(cur)
    return [[t for t in seg if t != "$"] for seg in segments]


def positionals(words, value_flags):
    out, i = [], 0
    while i < len(words):
        if words[i].startswith("-"):
            i += 2 if words[i] in value_flags else 1
        else:
            out.append(words[i])
            i += 1
    return out


def normalise(command):
    """Rewrite each `git …` / `gh …` call as `git <subcommand> …`, whatever the
    wrapper (env, timeout, xargs, then, VAR=x), path (/usr/bin/git, \\git) or
    global options (-C dir, -c k=v, --git-dir, --work-tree, --no-pager, -R repo),
    and refuse package installs that name a package, wherever the flags sit.
    Found 26 Nov: `git -C <dir> push --dry-run` and `npm install --dry-run x`
    slipped past the plain patterns."""
    out = []
    for toks in split_commands(command):
        start = 0  # also expose the command behind a wrapper to the `^supabase` style rules
        while start < len(toks) and (toks[start] in ("env", "command", "nohup", "time", "builtin", "exec", "xargs",
                                                     "then", "do", "else", "!", "{")
                                     or re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*=.*", toks[start]) or toks[start].startswith("-")):
            start += 1
        out.append(" ".join(toks[start:]))
        for i, word in enumerate(toks):
            tool, rest = os.path.basename(word.lstrip("\\")), toks[i + 1:]
            if tool in ("git", "gh"):
                while rest and rest[0].startswith("-"):
                    flag = rest.pop(0)
                    if flag in GIT_VALUE_FLAGS and rest:
                        value = rest.pop(0)
                        if tool == "git" and flag in ("-c", "--config-env") and GIT_BAD_CONFIG.match(value):
                            deny("overriding git aliases, identity, credentials or remotes")
                    elif tool == "git" and flag.startswith("--config-env=") and GIT_BAD_CONFIG.match(flag[13:]):
                        deny("overriding git aliases, identity, credentials or remotes")
                out.append(" ".join([tool] + rest))
            elif tool in ("npm", "pnpm", "yarn", "bun"):
                # -w takes a workspace name in npm; in pnpm it is a plain switch.
                args = positionals(rest, PKG_VALUE_FLAGS | ({"-w"} if tool == "npm" else set()))
                if tool == "yarn" and args[:1] == ["global"]:
                    args = args[1:]
                if tool == "yarn" and args[:1] == ["workspace"]:
                    args = args[2:]
                words = INSTALL_WORDS | ({"a"} if tool == "bun" else set())
                if len(args) > 1 and args[0] in words:
                    deny("installing a new package")
    # Commands inside $(…) or backticks run even when the whole thing is quoted.
    for pair in re.findall(r"\$\(([^()]*)\)|`([^`]*)`", command):
        inner = pair[0] or pair[1]
        if inner and inner != command:
            out.append(normalise(inner))
    return " ; ".join(out)


normalised = normalise(cmd)
for rx, why in COMPILED:
    if rx.search(cmd) or rx.search(normalised):
        deny(why)
# Pushing by other names.
if re.search(r"\bgit\s+(send-pack|http-push|remote-(https?|ext|fd)|config\b.*\balias\.)", normalised):
    deny("pushing or aliasing git by another name")

# Scripts the command runs: scan their contents with the same rules, because
# an agent can write a script and then execute it. Covers `bash x.sh`,
# `./x.sh`, `node x.mjs`, `python x.py`, `npx tsx x.ts` and `npm run <name>`.
SCRIPT_EXT = (".sh", ".bash", ".zsh", ".mjs", ".cjs", ".js", ".ts", ".mts", ".py")
# Look from the agent's directory (the hook runs elsewhere) and from any `cd`.
base = str(data.get("cwd") or os.getcwd())
dirs = [base]
for words in split_commands(cmd):
    if words[:1] in (["cd"], ["pushd"]) and len(words) > 1:
        dirs.append(os.path.normpath(os.path.join(dirs[-1], os.path.expanduser(words[-1]))))
for tok in re.findall(r"[^\s;&|()'\"`]+", cmd):
    if not (tok.endswith(SCRIPT_EXT) or tok.startswith("./")):
        continue
    for path in {os.path.join(d, tok) for d in dirs}:  # join keeps an absolute tok as is
        if os.path.isfile(path) and os.path.getsize(path) < 2_000_000:
            try:
                body = open(path, encoding="utf-8", errors="replace").read()
            except Exception:
                deny(f"a script that couldn't be read ({tok})")
            shellish = tok.endswith((".sh", ".bash", ".zsh")) or body.startswith("#!") and "sh" in body.split("\n", 1)[0]
            texts = [body]
            if shellish:
                texts += [normalise(line) for line in body.splitlines() if line.strip() and not line.lstrip().startswith("#")]
            for text in texts:
                for rx, why in COMPILED:
                    if rx.search(text):
                        deny(f"running {tok}, which contains {why}")
m = re.search(r"\b(npm|pnpm|yarn)\s+(run\s+|run-script\s+)?([\w:.-]+)", cmd)
if m and m.group(3) not in ("ci", "install", "i"):
    for d in dirs:
        try:
            scripts = json.load(open(os.path.join(d, "package.json"))).get("scripts", {})
        except Exception:
            scripts = {}
        body = scripts.get(m.group(3), "")
        if body:
            for text in (body, normalise(body)):
                for rx, why in COMPILED:
                    if rx.search(text):
                        deny(f"npm script '{m.group(3)}', which contains {why}")

# Database clients and docker: only against the local QA container.
LOCAL_QA = re.compile(r"\bdocker\s+exec\s+(-i\s+|-it\s+|-t\s+)?supabase_db_evntly-qa\b")
segments = re.split(r"&&|\|\||;|\|", cmd)
for seg in segments:
    if re.search(r"\bdocker\b", seg) and not LOCAL_QA.search(seg):
        deny("docker other than `docker exec supabase_db_evntly-qa …` (local QA)")
    if re.search(r"\b(psql|pg_dump|pg_restore|mysql|mongosh)\b", seg) and not LOCAL_QA.search(seg):
        deny("a database client outside the local QA container")

# Network tools: only localhost / 127.0.0.1.
if re.search(r"\b(curl|wget|nc|ncat|telnet|ssh|scp|rsync|ftp)\b", cmd):
    hosts = re.findall(r"(?:https?|ftp)://([^/\s:'\"]+)|\b[\w.-]+@([\w.-]+)", cmd)
    names = [h for pair in hosts for h in pair if h]
    if not names or any(h not in ("localhost", "127.0.0.1") for h in names):
        deny("a network transfer to an external host (localhost only)")
sys.exit(0)
