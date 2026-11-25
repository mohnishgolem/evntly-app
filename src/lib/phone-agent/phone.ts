// Australian phone numbers in E.164 (+61…), the only form the phone agent
// tables accept. Landlines (02/03/07/08) and mobiles (04) only: no 13/1300/1800
// numbers, no premium numbers, nothing overseas.

const E164_AU = /^\+61[2-478]\d{8}$/;

/** "0411 222 333", "+61 411 222 333", "(02) 9123 4567" → "+61411222333", else null. */
export function toE164(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/[^\d+]/g, "");
  let n = digits;
  if (n.startsWith("+61")) n = n.slice(3);
  else if (n.startsWith("0061")) n = n.slice(4);
  else if (n.startsWith("61") && n.length === 11) n = n.slice(2);
  else if (n.startsWith("0")) n = n.slice(1);
  else return null;
  const e164 = `+61${n}`;
  return E164_AU.test(e164) ? e164 : null;
}

export function isE164Au(value: unknown): value is string {
  return typeof value === "string" && E164_AU.test(value);
}

/** "+61411222333" → "0411 222 333" (mobiles) / "(02) 9123 4567" (landlines). */
export function formatAu(e164: string): string {
  if (!isE164Au(e164)) return e164;
  const local = `0${e164.slice(3)}`;
  return local.startsWith("04")
    ? `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`
    : `(${local.slice(0, 2)}) ${local.slice(2, 6)} ${local.slice(6)}`;
}

/** Last three digits only, for logs and lists ("•••• 333"). */
export function maskPhone(e164: string): string {
  return `•••• ${e164.slice(-3)}`;
}
