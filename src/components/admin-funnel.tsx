type Row = { step: number; label: string; week: number; month: number };

// Organiser funnel (steps 1–8) and vendor funnel (101+), 7 and 30 days.
// Each step shows the share of the step before it.
export function AdminFunnel({ rows }: { rows: Row[] }) {
  const organiser = rows.filter((r) => r.step < 100);
  const vendor = rows.filter((r) => r.step >= 100);
  return (
    <div className="space-y-8">
      <FunnelTable title="Organisers" rows={organiser} />
      <FunnelTable title="Vendors" rows={vendor} />
      <p className="text-xs text-muted-foreground">
        Visits are anonymous page views (a random id per browser, no cookies; Do Not Track is
        respected). Later steps come from signups, quotes and bookings. Admin accounts are excluded.
      </p>
    </div>
  );
}

function FunnelTable({ title, rows }: { title: string; rows: Row[] }) {
  const top = Math.max(1, ...rows.map((r) => r.month));
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="overflow-hidden rounded-2xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-2 font-medium">Step</th>
              <th className="px-2 py-2 text-right font-medium">7 days</th>
              <th className="px-4 py-2 text-right font-medium">30 days</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const prev = rows[i - 1];
              const share = prev && prev.month > 0 ? Math.round((r.month / prev.month) * 100) : null;
              return (
                <tr key={r.step} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">
                    <p>{r.label}</p>
                    <div className="mt-1.5 h-1.5 rounded-full bg-secondary">
                      <div className="h-1.5 rounded-full bg-primary" style={{ width: `${(r.month / top) * 100}%` }} />
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{r.week}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    {r.month}
                    {share != null && <span className="ml-1.5 text-xs text-muted-foreground">{share}%</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
