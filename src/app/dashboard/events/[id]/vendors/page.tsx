import { redirect } from "next/navigation";

// Vendor picking moved onto the Event Board (expandable vendor team), which
// matches by date, area and budget. Old links land there.
export default async function EventVendorSelectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/dashboard/events/${id}`);
}
