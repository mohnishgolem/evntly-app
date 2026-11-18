import { z } from "zod";

// A vendor package as the forms send it (money in dollars), shared by the
// vendor's own editor and the admin "set it up for me" tools.
export const packageSchema = z.object({
  name: z.string().trim().min(1, "Give the package a name.").max(80),
  description: z.string().trim().max(1000),
  price: z.number().min(1, "Enter a price.").max(100_000),
  includedHours: z.number().min(0.5).max(72).nullable(),
  extraHourPrice: z.number().min(1).max(10_000).nullable(),
  inclusions: z.array(z.string().trim().min(1).max(120)).max(20),
  deliveryDays: z.number().int().min(0).max(365).nullable(),
  depositPercent: z.number().int().min(0).max(100).nullable(),
  active: z.boolean(),
});


export type PackageInput = z.input<typeof packageSchema>;
export type ParsedPackage = z.output<typeof packageSchema>;

const cents = (dollars: number) => Math.round(dollars * 100);

/** The vendor_packages columns for a parsed package (money in cents). */
export function packageRow(d: ParsedPackage) {
  return {
    name: d.name,
    description: d.description || null,
    price_cents: cents(d.price),
    included_hours: d.includedHours,
    extra_hour_cents: d.extraHourPrice == null ? null : cents(d.extraHourPrice),
    inclusions: d.inclusions,
    delivery_days: d.deliveryDays,
    deposit_percent: d.depositPercent,
    active: d.active,
  };
}
