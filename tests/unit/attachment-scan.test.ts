import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findContactInfo } from "@/lib/contact-reveal";

// The real extractors (unpdf / tesseract.js), not mocks: the point is that
// contact details survive the trip through a PDF text layer or OCR.
const { extractAttachmentText } = await import("@/lib/attachment-scan");

// Smallest valid one-page PDF with a text layer.
function makePdf(text: string) {
  const stream = `BT /F1 18 Tf 50 700 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}

describe("attachment scanning", () => {
  it("finds a phone number in a PDF quote", async () => {
    const text = await extractAttachmentText(makePdf("Quote - call me on 0412 345 678"), "application/pdf");
    expect(findContactInfo(text ?? "").map((f) => f.category)).toContain("phone");
  });

  it("passes a PDF with prices and dates only", async () => {
    const text = await extractAttachmentText(makePdf("Package $1,200 for 120 guests on 14/03/2026"), "application/pdf");
    expect(findContactInfo(text ?? "")).toEqual([]);
  });

  it("OCRs a phone number and social handle out of a flyer photo", async () => {
    const flyer = process.env.ATTACHMENT_SCAN_FIXTURE;
    if (!flyer) return; // OCR needs the language data download; run with a fixture path.
    const text = await extractAttachmentText(new Uint8Array(readFileSync(flyer)), "image/jpeg");
    const categories = findContactInfo(text ?? "").map((f) => f.category);
    expect(categories).toEqual(expect.arrayContaining(["phone", "social"]));
  }, 60_000);

  it("converts an iPhone HEIC photo and OCRs it", async () => {
    const heic = process.env.ATTACHMENT_SCAN_HEIC_FIXTURE;
    if (!heic) return; // Needs a HEIC file (e.g. sips -s format heic flyer.jpg).
    const text = await extractAttachmentText(new Uint8Array(readFileSync(heic)), "image/heic");
    expect(findContactInfo(text ?? "").map((f) => f.category)).toEqual(expect.arrayContaining(["phone", "social"]));
  }, 60_000);

  it("doesn't try to read formats it can't decode", async () => {
    expect(await extractAttachmentText(new Uint8Array([1, 2, 3]), "application/zip")).toBeNull();
  });
});
