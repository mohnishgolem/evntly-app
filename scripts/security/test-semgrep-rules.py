#!/usr/bin/env python3
"""Regression test for the custom rules in .semgrep.yml.

Builds a throwaway tree of client/server files that import the service-role
client in every shape we care about, runs semgrep with the repo's rules and
checks exactly which files get flagged. Run from the repo root:

    python3 scripts/security/test-semgrep-rules.py
"""

import json
import os
import subprocess
import sys
import tempfile

RULES = os.path.abspath(".semgrep.yml")
PATH_RULE = "evntly-service-role-in-client"
DIRECTIVE_RULE = "evntly-service-role-in-use-client-file"

# path -> (source, rules expected to fire)
CASES = {
    # Client components under the path conventions: named imports are how the
    # admin client is actually used, so these are the important ones.
    "src/components/ui/named-import.tsx": (
        '"use client";\nimport { createAdminClient } from "@/lib/supabase/admin";\n',
        {PATH_RULE, DIRECTIVE_RULE},
    ),
    "src/components/ui/default-import.tsx": (
        '"use client";\nimport admin from "@/lib/supabase/admin";\n',
        {PATH_RULE, DIRECTIVE_RULE},
    ),
    "src/components/ui/relative-import.tsx": (
        "import { createAdminClient } from '../../lib/supabase/admin';\n",
        {PATH_RULE},
    ),
    "src/app/vendors/new/signup-client.tsx": (
        '"use client";\nimport { createAdminClient } from "@/lib/supabase/admin";\n',
        {PATH_RULE, DIRECTIVE_RULE},
    ),
    # Client modules outside the path conventions.
    "src/app/messages/thread-view.tsx": (
        "// Thread UI\n'use client'\nimport * as admin from \"@/lib/supabase/admin\";\n",
        {DIRECTIVE_RULE},
    ),
    "src/hooks/use-thing.ts": (
        '"use client";\nexport const load = () => import("@/lib/supabase/admin");\n',
        {DIRECTIVE_RULE},
    ),
    # Legitimate server-side use must stay quiet.
    "src/lib/actions/server-action.ts": (
        '"use server";\nimport { createAdminClient } from "@/lib/supabase/admin";\n',
        set(),
    ),
    "src/app/messages/page.tsx": (
        'import { createAdminClient } from "@/lib/supabase/admin";\n',
        set(),
    ),
    "src/app/api/stripe/webhook/route.ts": (
        'import { createAdminClient } from "@/lib/supabase/admin";\n',
        set(),
    ),
    # A client component using only the browser client.
    "src/components/ui/clean.tsx": (
        '"use client";\nimport { createClient } from "@/lib/supabase/client";\n',
        set(),
    ),
}


def main() -> int:
    with tempfile.TemporaryDirectory() as root:
        for rel, (source, _) in CASES.items():
            path = os.path.join(root, rel)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w") as f:
                f.write(source)
        # A git repo so path anchoring behaves exactly as in the CI scan.
        subprocess.run(["git", "init", "-q"], cwd=root, check=True)
        subprocess.run(["git", "add", "-A"], cwd=root, check=True)
        out = subprocess.run(
            ["semgrep", "scan", "--config", RULES, "--metrics=off", "--json", "--quiet"],
            cwd=root,
            capture_output=True,
            text=True,
        )
        if out.returncode not in (0, 1):
            print(out.stderr, file=sys.stderr)
            return 2
        report = json.loads(out.stdout)

    if report.get("errors"):
        print(json.dumps(report["errors"], indent=2), file=sys.stderr)
        return 2

    found = {}
    for r in report["results"]:
        found.setdefault(r["path"], set()).add(r["check_id"].rsplit(".", 1)[-1])

    failed = False
    for rel, (_, expected) in CASES.items():
        got = found.get(rel, set()) & {PATH_RULE, DIRECTIVE_RULE}
        status = "ok" if got == expected else "FAIL"
        failed |= got != expected
        print(f"{status:4} {rel}: expected {sorted(expected)}, got {sorted(got)}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
