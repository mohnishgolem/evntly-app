// Message attachments live in the private "message-attachments" bucket at
// "<providerId>/<customerUserId>/<uuid>-<filename>" — the two halves of the
// conversation id — so storage policies (is_conversation_participant) and
// the fill_message_recipient trigger can check access from the path alone.
// Keep these lists in sync with the bucket's allowed_mime_types.

export const ATTACHMENT_BUCKET = "message-attachments";
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ATTACHMENT_ACCEPT = "image/*,application/pdf";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "application/pdf",
]);

export type Attachment = { path: string; type: string };

export function isAllowedAttachmentType(type: string) {
  return ALLOWED_TYPES.has(type);
}

export function isImageAttachment(type: string | null | undefined) {
  return !!type && type.startsWith("image/");
}

export function attachmentFolder(conversationId: string) {
  const [providerId, customerUserId] = conversationId.split(":");
  return `${providerId}/${customerUserId}/`;
}

export function attachmentPath(conversationId: string, fileName: string) {
  // Keep the original name readable for the file chip, but storage-safe.
  const safe =
    fileName
      .normalize("NFKD")
      .replace(/[^\w.\-]+/g, "_")
      .replace(/_+/g, "_")
      .slice(-80) || "file";
  return `${attachmentFolder(conversationId)}${crypto.randomUUID()}-${safe}`;
}

export function attachmentFileName(path: string) {
  const last = path.split("/").pop() ?? path;
  // Strip the "<uuid>-" prefix (a UUID is 36 characters).
  return last.length > 37 ? last.slice(37) : last;
}

/** For previews and notifications when a message has no text. */
export function attachmentLabel(type: string | null | undefined) {
  return isImageAttachment(type) ? "📷 Photo" : "📎 PDF";
}
