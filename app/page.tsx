import { prisma } from "@/lib/db";
import { StatusBadge } from "./components/StatusBadge";
import { screenshotUrl } from "@/lib/screenshotUrl";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [companyCount, jobCount, applications, resumeVariants, blockedCompanies] = await Promise.all([
    prisma.company.count({ where: { active: true } }),
    prisma.job.count(),
    prisma.application.findMany({ include: { job: { include: { company: true } }, resumeVariant: true } }),
    prisma.resumeVariant.findMany(),
    prisma.company.findMany({ where: { blocked: true } }),
  ]);

  const byStatus = applications.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});

  const byResume = resumeVariants.map((rv) => ({
    label: rv.label,
    count: applications.filter((a) => a.resumeVariantId === rv.id).length,
  }));

  const byCompany = Object.entries(
    applications.reduce<Record<string, number>>((acc, a) => {
      acc[a.job.company.name] = (acc[a.job.company.name] ?? 0) + 1;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  const recent = applications
    .sort((a, b) => b.appliedAt.getTime() - a.appliedAt.getTime())
    .slice(0, 10);

  return (
    <div className="flex flex-col gap-10">
      <div>
        <div className="text-xs font-mono uppercase tracking-widest text-text-faint mb-1">Mission control</div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Readout label="Active companies" value={companyCount} color="var(--accent)" />
        <Readout label="Jobs tracked" value={jobCount} color="var(--status-manual)" />
        <Readout label="Ready for review" value={byStatus["ready_for_review"] ?? 0} color="var(--status-review)" />
        <Readout label="Submitted" value={byStatus["submitted"] ?? 0} color="var(--status-submitted)" />
        <Readout label="Manual apply needed" value={byStatus["manual_apply_needed"] ?? 0} color="var(--status-manual)" />
        <Readout label="Failed" value={byStatus["failed"] ?? 0} color="var(--status-failed)" />
        <Readout label="Blocked companies" value={blockedCompanies.length} color="var(--status-failed)" />
      </div>

      {blockedCompanies.length > 0 && (
        <div className="card border-l-2 p-4 text-sm" style={{ borderLeftColor: "var(--status-failed)" }}>
          <div className="font-mono text-xs uppercase tracking-wide mb-1" style={{ color: "var(--status-failed)" }}>
            Circuit breaker tripped
          </div>
          <div className="text-text-muted">
            {blockedCompanies.map((c) => `${c.name} (${c.lastFailureReason ?? "unknown"})`).join(", ")}. Investigate manually, then reset with{" "}
            <code className="text-text bg-surface-raised px-1.5 py-0.5 rounded font-mono text-xs">
              npx tsx scripts/manage-companies.ts --unblock &quot;Name&quot;
            </code>
          </div>
        </div>
      )}

      <section className="card p-5">
        <h2 className="text-sm font-mono uppercase tracking-wide text-text-muted mb-4">Applications by resume</h2>
        <div className="flex flex-col">
          {byResume.map((r) => (
            <div key={r.label} className="flex justify-between border-b border-border-soft py-2 text-sm last:border-0">
              <span>{r.label}</span>
              <span className="data-cell text-text-muted">{r.count}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-mono uppercase tracking-wide text-text-muted mb-4">Applications by company</h2>
        <div className="flex flex-col">
          {byCompany.length === 0 && <p className="text-text-faint text-sm">No applications yet.</p>}
          {byCompany.map(([name, count]) => (
            <div key={name} className="flex justify-between border-b border-border-soft py-2 text-sm last:border-0">
              <span>{name}</span>
              <span className="data-cell text-text-muted">{count}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card p-5">
        <h2 className="text-sm font-mono uppercase tracking-wide text-text-muted mb-4">Recent activity</h2>
        <div className="flex flex-col">
          {recent.length === 0 && <p className="text-text-faint text-sm">Nothing yet — run /auto-apply.</p>}
          {recent.map((a) => {
            const shot = screenshotUrl(a.screenshotPath);
            return (
              <div key={a.id} className="flex items-center justify-between gap-4 border-b border-border-soft py-3 text-sm last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  {shot ? (
                    <a href={shot} target="_blank" className="shrink-0">
                      <img src={shot} alt="" className="w-10 h-10 object-cover object-top rounded border border-border" />
                    </a>
                  ) : (
                    <div className="w-10 h-10 rounded border border-border-soft shrink-0" />
                  )}
                  <div className="min-w-0">
                    <a href={a.job.url} target="_blank" className="link-row font-medium block truncate">
                      {a.job.title}
                    </a>
                    <div className="text-text-muted text-xs truncate">
                      {a.job.company.name} · {a.resumeVariant?.label ?? "—"}
                    </div>
                  </div>
                </div>
                <StatusBadge status={a.status} />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Readout({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="readout" style={{ "--stat-color": color } as React.CSSProperties}>
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}
