"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type BlockState = { error?: string; success?: boolean } | null;

// Blocks are resolved server-side from a conversation or quote the caller is
// part of (block_user RPC) — users never see each other's emails, so there's
// no address to pass. A block in either direction stops new messages, quote
// requests and event applications between the two.
export async function blockUser(target: {
  conversationId?: string;
  quoteId?: string;
}): Promise<BlockState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("block_user", {
    p_conversation_id: target.conversationId,
    p_quote_id: target.quoteId,
  });
  if (error) return { error: error.message };

  if (target.conversationId) {
    revalidatePath(`/messages/${encodeURIComponent(target.conversationId)}`);
  }
  revalidatePath("/messages");
  revalidatePath("/vendor-dashboard", "layout");
  revalidatePath("/profile/blocked");
  return { success: true };
}

export async function unblockUser(target: {
  blockId?: string;
  conversationId?: string;
}): Promise<BlockState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("unblock_user", {
    p_block_id: target.blockId,
    p_conversation_id: target.conversationId,
  });
  if (error) return { error: error.message };

  if (target.conversationId) {
    revalidatePath(`/messages/${encodeURIComponent(target.conversationId)}`);
  }
  revalidatePath("/profile/blocked");
  return { success: true };
}
