import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// PostgREST can only order an RPC's result by columns in its select list. The
// Photos, Pricing & packages, Calendar and Profile pages ordered
// my_service_providers by created_at without selecting it, so the query
// failed (42703) and Photos showed "Create your listing first" to every
// vendor (reported by DJ Valgen, found 17 Nov). Guard every call site.

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe("my_service_providers queries", () => {
  it("only order by columns they select", () => {
    const problems: string[] = [];
    for (const file of sourceFiles(join(process.cwd(), "src"))) {
      const text = readFileSync(file, "utf8");
      const re = /\.rpc\("my_service_providers"\)([\s\S]{0,600}?)(?:;|,\n\s{2,6}supabase|\]\))/g;
      for (const m of text.matchAll(re)) {
        const chain = m[1];
        const select = chain.match(/\.select\("([^"]*)"/)?.[1];
        if (!select || select.trim() === "*") continue;
        const columns = select.split(",").map((c) => c.trim());
        for (const o of chain.matchAll(/\.order\("([a-z_]+)"/g)) {
          if (!columns.includes(o[1])) problems.push(`${file.replace(process.cwd() + "/", "")}: orders by ${o[1]} but selects "${select}"`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
