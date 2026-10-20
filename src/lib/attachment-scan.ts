import "server-only";
import path from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { findContactInfo } from "@/lib/contact-reveal";
import { ATTACHMENT_BUCKET } from "@/lib/attachments";
import { recordError } from "@/lib/error-report";

// Scans a message attachment for contact details before the other party can
// open it (see the attachment_scanning migration for the visibility rules).
// Photos are OCR'd with tesseract.js; PDFs have their text layer extracted.
// The verdict is written with the service role — users can't set it.

export type ScanResult = "clear" | "contact" | "error";

const SCAN_TIMEOUT_MS = 45_000;
const MAX_PDF_TEXT = 100_000;
// Formats tesseract can decode directly. iPhone HEIC originals (when the
// browser couldn't convert them before upload) are converted to JPEG first.
const OCR_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const HEIC_TYPES = new Set(["image/heic", "image/heif"]);
const OCR_LANG_PATH = path.join(process.cwd(), "node_modules/@tesseract.js-data/eng/4.0.0_best_int");

async function extractPdfText(bytes: Uint8Array) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return text.slice(0, MAX_PDF_TEXT);
}

async function ocrImage(bytes: Uint8Array) {
  const { createWorker } = await import("tesseract.js");
  // English LSTM data ships with the app (@tesseract.js-data/eng, traced
  // into the function by next.config) rather than being downloaded from a
  // CDN on each cold start. /tmp is the only writable directory on Vercel.
  // errorHandler: a crashed worker otherwise leaves recognize() pending
  // forever (we'd only find out from the timeout).
  let workerError: unknown = null;
  const worker = await createWorker("eng", 1, {
    langPath: OCR_LANG_PATH,
    cachePath: "/tmp",
    errorHandler: (err: unknown) => {
      workerError = err;
    },
  });
  if (workerError) throw workerError;
  try {
    const { data } = await worker.recognize(Buffer.from(bytes));
    return data.text;
  } finally {
    await worker.terminate();
  }
}

async function heicToJpeg(bytes: Uint8Array) {
  const { default: convert } = await import("heic-convert");
  const jpeg = await convert({ buffer: Buffer.from(bytes), format: "JPEG", quality: 0.9 });
  return new Uint8Array(jpeg);
}

export async function extractAttachmentText(bytes: Uint8Array, type: string) {
  if (type === "application/pdf") return extractPdfText(bytes);
  if (OCR_TYPES.has(type)) return ocrImage(bytes);
  if (HEIC_TYPES.has(type)) return ocrImage(await heicToJpeg(bytes));
  return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("scan timed out")), ms)),
  ]);
}

/**
 * Downloads, scans and records the verdict for one message's attachment.
 * Never throws; a failed scan is recorded as "error" (the file is shown).
 */
export async function scanMessageAttachment(messageId: string): Promise<ScanResult | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data: message } = await admin
    .from("messages")
    .select("id, conversation_id, attachment_file_uri, attachment_type, sender_user_id, recipient_user_id")
    .eq("id", messageId)
    .maybeSingle();
  if (!message?.attachment_file_uri || !message.attachment_type) return null;

  let result: ScanResult = "error";
  let found: { category: string; match: string }[] = [];
  try {
    const { data: blob, error } = await admin.storage.from(ATTACHMENT_BUCKET).download(message.attachment_file_uri);
    if (error || !blob) throw error ?? new Error("download failed");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const text = await withTimeout(extractAttachmentText(bytes, message.attachment_type), SCAN_TIMEOUT_MS);
    if (text != null) {
      found = findContactInfo(text);
      result = found.length > 0 ? "contact" : "clear";
    }
  } catch (err) {
    console.error("[attachment-scan] failed:", err);
    await recordError({
      source: "server",
      message: `Attachment scan failed (${message.attachment_type}): ${err instanceof Error ? err.message : String(err)}`,
      stack: err instanceof Error ? err.stack : null,
      route: "attachment-scan",
    });
  }

  await admin.from("messages").update({ attachment_scan: result }).eq("id", message.id);

  if (result === "contact") {
    // Admin-only leak log, alongside flagged payment talk.
    await admin.from("leakage_events").insert({
      sender_id: message.sender_user_id ?? "unknown",
      conversation_id: message.conversation_id,
      sender_user_id: message.sender_user_id,
      recipient_user_id: message.recipient_user_id,
      category: `attachment_${found[0].category}`,
      original_snippet: found.map((f) => f.match).join(", ").slice(0, 500),
      redacted_message: "Attachment held back until a booking is confirmed",
      delivered: false,
    });
  }
  return result;
}
