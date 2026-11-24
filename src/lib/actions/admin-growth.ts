"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminSession } from "@/lib/data/user";
import { createClient } from "@/lib/supabase/server";
import { SPEND_CHANNELS } from "@/lib/growth";

// Acquisition spend log for Admin → Growth: money actually spent, typed in by
// an admin. RLS (acquisition_spend_admin) also requires an admin with MFA.


const spendSchema = z.object({
  day: z.iso.date("Pick the day it was spent."),
  channel: z.enum(SPEND_CHANNELS),
  audience: z.enum(["vendor", "customer"]),
  amount: z.number().min(0).max(100_000),
  note: z.string().trim().max(500).optional(),
});

export type SpendState = { error?: string; success?: boolean } | null;

async function adminClient() {
  const { admin, mfa } = await getAdminSession();
  if (!admin || mfa !== "ok") return null;
  return (await createClient()) as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
      delete: () => { eq: (c: string, v: number) => Promise<{ error: { message: string } | null }> };
    };
  };
}

export async function addAcquisitionSpend(input: z.input<typeof spendSchema>): Promise<SpendState> {
  const parsed = spendSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  const db = await adminClient();
  if (!db) return { error: "Not authorized." };
  const { day, channel, audience, amount, note } = parsed.data;
  const { error } = await db
    .from("acquisition_spend")
    .insert({ day, channel, audience, amount_cents: Math.round(amount * 100), note: note || null });
  if (error) return { error: "Couldn't save. Is the growth dashboard migration applied?" };
  revalidatePath("/admin/growth");
  return { success: true };
}

export async function deleteAcquisitionSpend(id: number): Promise<SpendState> {
  if (!Number.isInteger(id) || id <= 0) return { error: "Not found." };
  const db = await adminClient();
  if (!db) return { error: "Not authorized." };
  const { error } = await db.from("acquisition_spend").delete().eq("id", id);
  if (error) return { error: "Couldn't delete." };
  revalidatePath("/admin/growth");
  return { success: true };
}
