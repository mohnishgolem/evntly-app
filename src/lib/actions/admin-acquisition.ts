"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminSession } from "@/lib/data/user";
import { IMPORT_VERDICTS, isConsentBasis, isProspectAction, parseProspectCsv } from "@/lib/acquisition/pipeline";

export type AcquisitionState = { error?: string; success?: boolean; message?: string; details?: string[]; counts?: Record<string, number> } | null;

const PATH = "/admin/beta-vendors";
const MAX_CSV_BYTES = 1_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Same gate as the other admin actions: admin role + MFA-verified session.
// Every RPC below checks is_admin() again in the database. Nothing here
// contacts anyone: prospects are only recorded and moved along.
async function requireAdmin() {
  const { session, admin, mfa } = await getAdminSession();
  if (!admin || mfa !== "ok") return null;
  return session;
}

/** "Check file" (writes nothing) or "Import" a research batch of prospects. */
export async function importProspects(_prev: AcquisitionState, formData: FormData): Promise<AcquisitionState> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  const commit = formData.get("mode") === "import";
  const file = formData.get("file");
  const text = file instanceof File && file.size > 0 ? await file.text() : (formData.get("csv")?.toString() ?? "");
  if (!text.trim()) return { error: "Choose a CSV file or paste the rows." };
  if (text.length > MAX_CSV_BYTES) return { error: "That file is too large (1 MB max)." };

  const { rows, errors } = parseProspectCsv(text);
  if (!rows.length) return { error: errors[0] ?? "No rows to import.", details: errors.slice(1, 20) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_import_prospects", { p_rows: rows, p_commit: commit });
  if (error) return { error: error.message };

  const counts: Record<string, number> = {};
  for (const r of data ?? []) counts[r.verdict] = (counts[r.verdict] ?? 0) + 1;
  const noConsent = rows.filter((r, i) => data?.[i]?.verdict === "new" && r.consent_basis === "none").length;
  const details = [
    ...Object.entries(counts).map(([v, n]) => `${IMPORT_VERDICTS[v] ?? v}: ${n}`),
    ...(noConsent ? [`${noConsent} new without a consent basis: they can't be contacted until you record one (e.g. a yes on a call).`] : []),
    ...errors.slice(0, 10),
  ];
  if (commit) revalidatePath(PATH);
  return {
    success: true,
    message: commit ? `Imported ${counts.new ?? 0} new prospects. Nobody was contacted.` : `Checked ${rows.length} rows. Nothing was imported.`,
    details,
    counts,
  };
}

export async function prospectAction(prospectId: string, action: string, note?: string): Promise<AcquisitionState> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  if (!UUID.test(prospectId)) return { error: "Unknown prospect." };
  if (!isProspectAction(action)) return { error: "Unknown action." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_prospect_action", {
    p_prospect_id: prospectId,
    p_action: action,
    ...(note?.trim() ? { p_note: note.trim().slice(0, 300) } : {}),
  });
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}

export async function setProspectConsent(prospectId: string, basis: string, note?: string): Promise<AcquisitionState> {
  if (!(await requireAdmin())) return { error: "Not authorized." };
  if (!UUID.test(prospectId)) return { error: "Unknown prospect." };
  if (!isConsentBasis(basis)) return { error: "Unknown consent basis." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_prospect_consent", {
    p_prospect_id: prospectId,
    p_basis: basis,
    ...(note?.trim() ? { p_note: note.trim().slice(0, 300) } : {}),
  });
  if (error) return { error: error.message };
  revalidatePath(PATH);
  return { success: true };
}
