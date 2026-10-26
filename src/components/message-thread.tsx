"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Paperclip, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendReply } from "@/lib/actions/messages";
import { createClient } from "@/lib/supabase/client";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_BUCKET,
  MAX_ATTACHMENT_BYTES,
  attachmentFileName,
  attachmentLabel,
  attachmentPath,
  isAllowedAttachmentType,
  isImageAttachment,
} from "@/lib/attachments";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/supabase/database.types";

type Message = Database["public"]["Functions"]["conversation_messages"]["Returns"][number] & {
  attachmentUrl: string | null;
  /** Set (pre-booking) while the file is being scanned or contains contact details. */
  attachmentHeld?: "pending" | "contact" | null;
};

// Phone photos are often 4000px+ / several MB; downscale before upload so
// sending is quick on mobile data. GIFs keep their animation, PDFs pass through.
const MAX_IMAGE_EDGE = 2048;

async function prepareFile(file: File): Promise<File> {
  if (!isImageAttachment(file.type) || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    );
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    // e.g. HEIC outside Safari — upload as-is and let the bucket's type
    // check decide.
    return file;
  }
}

export function MessageThread({
  conversationId,
  messages,
  counterpartName,
  closedReason,
}: {
  conversationId: string;
  messages: Message[];
  counterpartName: string;
  /** Set when a block stops new messages; replaces the composer. */
  closedReason?: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // New messages from the other side: re-fetch the thread every few seconds
  // while it's on screen, and straight away when the app comes back to the
  // foreground. A refresh goes through the same masked RPC as the first load,
  // so nothing bypasses the contact-detail rules; the draft being typed is
  // client state and survives it.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const timer = window.setInterval(refresh, 8000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  // Revoke the last preview's object URL when the thread unmounts.
  const previewRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  function setPreviewFor(next: File | null) {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = next && isImageAttachment(next.type) ? URL.createObjectURL(next) : null;
    previewRef.current = url;
    setPreview(url);
  }

  function pickFile(picked: File | undefined) {
    setError(null);
    if (!picked) return;
    if (!isAllowedAttachmentType(picked.type)) {
      setError("You can attach photos or PDFs.");
      return;
    }
    if (picked.type === "application/pdf" && picked.size > MAX_ATTACHMENT_BYTES) {
      setError("That file is over 10 MB.");
      return;
    }
    setFile(picked);
    setPreviewFor(picked);
  }

  function clearFile() {
    setFile(null);
    setPreviewFor(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function submit() {
    if (!content.trim() && !file) return;
    setError(null);
    startTransition(async () => {
      let attachment: { path: string; type: string } | undefined;
      if (file) {
        const prepared = await prepareFile(file);
        if (prepared.size > MAX_ATTACHMENT_BYTES) {
          setError("That file is over 10 MB.");
          return;
        }
        const path = attachmentPath(conversationId, prepared.name);
        const { error: uploadError } = await createClient()
          .storage.from(ATTACHMENT_BUCKET)
          .upload(path, prepared, { contentType: prepared.type });
        if (uploadError) {
          setError("Couldn't upload that file. Try again.");
          return;
        }
        attachment = { path, type: prepared.type };
      }

      const res = await sendReply(conversationId, content, attachment);
      if (res?.error) {
        setError(res.error);
      } else {
        setContent("");
        clearFile();
        router.refresh();
      }
    });
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-2xl border border-border">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            Say hello to {counterpartName}.
          </p>
        ) : (
          messages.map((m) => {
            const isSelf = m.from_me;
            return (
              <div key={m.id} className={cn("flex flex-col", isSelf ? "items-end" : "items-start")}>
                <span className="mb-0.5 text-xs text-muted-foreground">
                  {isSelf ? "You" : counterpartName}
                </span>
                {m.attachment_file_uri && (
                  <MessageAttachment
                    url={m.attachmentUrl}
                    path={m.attachment_file_uri}
                    type={m.attachment_type}
                    isSelf={isSelf}
                    held={m.attachmentHeld ?? null}
                    counterpartName={counterpartName}
                  />
                )}
                {m.content && (
                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
                      isSelf ? "bg-primary text-primary-foreground" : "bg-secondary",
                      m.attachment_file_uri && "mt-1"
                    )}
                  >
                    {m.content}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      {closedReason ? (
        <p className="border-t border-border p-4 text-center text-sm text-muted-foreground">
          {closedReason}
        </p>
      ) : (
        <form action={submit} className="border-t border-border p-3">
          {file && (
            <div className="mb-2 flex items-center gap-2 rounded-xl bg-secondary p-2">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="size-12 rounded-lg object-cover" />
              ) : (
                <span className="flex size-12 items-center justify-center rounded-lg bg-background">
                  <FileText className="size-5 text-muted-foreground" />
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-sm">{file.name}</span>
              <button
                type="button"
                onClick={clearFile}
                disabled={pending}
                aria-label="Remove attachment"
                className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={ATTACHMENT_ACCEPT}
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={pending}
              onClick={() => fileRef.current?.click()}
              aria-label="Attach a photo or PDF"
            >
              <Paperclip className="size-4" />
            </Button>
            <Textarea
              rows={1}
              placeholder={file ? "Add a caption…" : `Message ${counterpartName}…`}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              className="min-h-9 flex-1 resize-none"
            />
            <Button
              type="submit"
              size="icon"
              disabled={pending || (!content.trim() && !file)}
              aria-label="Send"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </div>
        </form>
      )}
      {error && <p className="px-3 pb-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}

function MessageAttachment({
  url,
  path,
  type,
  isSelf,
  held,
  counterpartName,
}: {
  url: string | null;
  path: string;
  type: string | null;
  isSelf: boolean;
  held: "pending" | "contact" | null;
  counterpartName: string;
}) {
  if (held && !isSelf) {
    return (
      <span className="max-w-[80%] rounded-2xl bg-secondary px-3.5 py-2 text-sm text-muted-foreground">
        {held === "pending"
          ? `${attachmentLabel(type)} — checking the file…`
          : `${attachmentLabel(type)} hidden until this booking is confirmed (it contains contact details).`}
      </span>
    );
  }
  if (held === "contact" && isSelf && url) {
    return (
      <div className="flex max-w-[80%] flex-col items-end gap-1">
        <MessageAttachment
          url={url}
          path={path}
          type={type}
          isSelf
          held={null}
          counterpartName={counterpartName}
        />
        <span className="text-xs text-muted-foreground">
          Hidden from {counterpartName} until a booking is confirmed: it looks like it contains
          contact details.
        </span>
      </div>
    );
  }
  if (!url) {
    return (
      <span className="rounded-2xl bg-secondary px-3.5 py-2 text-sm text-muted-foreground">
        Attachment unavailable
      </span>
    );
  }
  if (isImageAttachment(type)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block max-w-[70%]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="Photo attachment"
          loading="lazy"
          className="max-h-72 rounded-2xl border border-border object-cover"
        />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "flex max-w-[80%] items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm",
        isSelf ? "bg-primary text-primary-foreground" : "bg-secondary"
      )}
    >
      <FileText className="size-4 shrink-0" />
      <span className="truncate">{attachmentFileName(path)}</span>
    </a>
  );
}
