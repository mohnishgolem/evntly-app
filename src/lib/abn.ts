// Australian Business Number checks (ATO algorithm): subtract 1 from the
// first digit, weight each digit, and the sum must be divisible by 89.
const WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

/** Digits only, or null if empty. Accepts "12 345 678 901" style input. */
export function normalizeAbn(input: string | null | undefined) {
  const digits = (input ?? "").replace(/\s+/g, "");
  return digits === "" ? null : digits;
}

export function isValidAbn(input: string | null | undefined) {
  const abn = normalizeAbn(input);
  if (!abn || !/^\d{11}$/.test(abn)) return false;
  const digits = abn.split("").map(Number);
  digits[0] -= 1;
  const sum = digits.reduce((total, d, i) => total + d * WEIGHTS[i], 0);
  return sum % 89 === 0;
}

/** "51824753556" -> "51 824 753 556" */
export function formatAbn(abn: string | null | undefined) {
  const digits = normalizeAbn(abn);
  if (!digits || digits.length !== 11) return abn ?? "";
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
}
