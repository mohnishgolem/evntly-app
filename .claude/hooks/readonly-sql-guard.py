#!/usr/bin/env python3
"""PreToolUse guard: allow only single read-only SQL statements.

Used by agents that may read production Supabase but must never write to it
(see .claude/agents/evntly-vendor-acquisition.md). Fails closed: anything it
cannot prove is a single SELECT/WITH/EXPLAIN/SHOW without write keywords is
denied.

This is a text filter, not a database permission: it cannot tell whether a
function called from a SELECT writes data. Only a read-only database role can.
"""
import json
import re
import sys

WRITE = re.compile(
    r"\b(insert|update|delete|merge|upsert|alter|drop|create|truncate|grant|revoke|"
    r"copy|call|do|vacuum|reindex|cluster|refresh|comment|security|owner|lock|"
    r"set_config|pg_terminate_backend|pg_cancel_backend|dblink|lo_import|lo_export|"
    r"into|nextval|setval)\b"
)
READ_START = re.compile(r"^\s*(select|with|explain|show|table|values)\b")

# Secret-bearing objects the read-only role CAN read (pg_read_all_data), which
# no agent SQL file needs: Vault, app_settings (holds cron_secret), password
# hashes and auth tokens, cron and pg_net internals, server files and settings.
# Added 26 Nov 2026 after the effective-permission check in READONLY-DB-ACCESS.md.
SECRETS = re.compile(
    r"\b(vault|decrypted_secrets|app_settings|encrypted_password|raw_app_meta_data|"
    r"[a-z_]*_tokens?(?:_[a-z_]+)?|secrets?|pg_settings|pg_file_settings|pg_hba_file_rules|"
    r"pg_read_file|pg_read_binary_file|pg_ls_dir|pg_stat_file|pg_ls_logdir|pg_ls_waldir|"
    r"supabase_functions|pgsodium|lo_get|loread|"
    r"sessions|mfa_factors|mfa_challenges|identities|flow_state|saml_[a-z_]+|sso_[a-z_]+)\b"
    r"|\b(cron|net)\s*\."
)
SHOW_OK = re.compile(r"^\s*show\s+transaction_read_only\s*$")

# One token at a time, left to right, so a comment marker inside a string (or a
# quote inside a comment) is never mistaken for the real thing. Identifiers are
# matched whole because they may contain "$", which must not open a dollar quote.
NAME_START = r"A-Za-z_\u0080-\U0010ffff"
TOKEN = re.compile(
    rf"""(?P<line>--[^\r\n]*)
    |(?P<block>/\*)
    |(?P<string>'(?:[^']|'')*')
    |(?P<quoted>"(?:[^"]|"")*")
    |(?P<dollar>\$(?P<tag>(?:[{NAME_START}][{NAME_START}0-9]*)?)\$)
    |(?P<name>[{NAME_START}][{NAME_START}0-9$]*)
    |(?P<other>.)""",
    re.S | re.X,
)
BLOCK_EDGE = re.compile(r"/\*|\*/")


def deny(reason):
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": "Read-only agent: " + reason
            + " Draft the change for Sai instead; the main session applies it after approval.",
        }
    }))
    sys.exit(0)


def code_only(sql):
    """Return the SQL with comments and string contents removed."""
    out, i = [], 0
    while i < len(sql):
        m = TOKEN.match(sql, i)
        kind, text, i = m.lastgroup, m.group(), m.end()
        if kind == "line":
            out.append(" ")
        elif kind == "block":
            depth = 1  # Postgres block comments nest.
            while depth:
                edge = BLOCK_EDGE.search(sql, i)
                if not edge:
                    deny("unterminated comment.")
                depth += 1 if edge.group() == "/*" else -1
                i = edge.end()
            out.append(" ")
        elif kind == "string":
            out.append("''")
        elif kind == "quoted":
            # Keep the words so a quoted function name is still checked.
            out.append(" " + re.sub(r"\W+", " ", text) + " ")
        elif kind == "dollar":
            end = sql.find(text, i)
            if end < 0:
                deny("unterminated dollar-quoted string.")
            i = end + len(text)
            out.append("''")
        elif kind == "name":
            # E'...' and U&"..." have escape rules this lexer does not model.
            if text.lower() == "e" and sql.startswith("'", i):
                deny("E'...' strings are not allowed.")
            if text.lower() == "u" and sql.startswith('&"', i):
                deny('U&"..." identifiers are not allowed.')
            out.append(text)
        else:
            if text in ("'", '"', "\0"):
                deny("unterminated quote or invalid character.")
            out.append(text)
    return "".join(out)


try:
    data = json.load(sys.stdin)
except Exception:
    deny("could not parse the tool call.")

sql = str((data.get("tool_input") or {}).get("query") or "")
if not sql.strip():
    deny("empty query.")

s = code_only(sql).lower()

body = s.strip().rstrip(";").strip()
if ";" in body:
    deny("multiple statements are not allowed.")
if not READ_START.match(body):
    deny("only SELECT / WITH / EXPLAIN / SHOW queries are allowed.")
if re.search(r"\bexplain\b[^;]*\banaly[sz]e\b", body):
    deny("EXPLAIN ANALYZE executes the query.")
m = WRITE.search(body)
if m:
    deny(f"write keyword '{m.group(1)}' found.")
m = SECRETS.search(body)
if m:
    deny(f"'{m.group(0).strip()}' holds secrets or server internals and is off limits.")
if body.startswith("show") and not SHOW_OK.match(body):
    deny("only SHOW transaction_read_only is allowed.")
# current_setting() can read custom settings that may hold secrets. Its
# argument is a string (stripped above), so check the raw text.
for arg in re.findall(r"current_setting\s*\(\s*'([^']*)'", sql, flags=re.I):
    if arg.strip().lower() != "transaction_read_only":
        deny(f"current_setting('{arg}') is not allowed.")
if "current_setting" in body and not re.search(r"current_setting\s*\(\s*'", sql, flags=re.I):
    deny("current_setting() needs a literal setting name.")
sys.exit(0)
