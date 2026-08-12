import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [companyCount, jobCount, applications, resumeVariants] = await Promise.all([
    prisma.company.count({ where: { active: true } }),
    prisma.job.count(),
    prisma.application.findMany({ include: { job: { include: { company: true } }, resumeVariant: true } }),
    prisma.resumeVariant.findMany(),
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
    <div className="max-w-5xl mx-auto flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Active companies" value={companyCount} />
        <StatCard label="Jobs tracked" value={jobCount} />
        <StatCard label="Ready for review" value={byStatus["ready_for_review"] ?? 0} />
        <StatCard label="Submitted" value={byStatus["submitted"] ?? 0} />
      </div>

      <section>
        <h2 className="text-lg font-medium mb-3">Applications by resume</h2>
        <div className="flex flex-col gap-2">
          {byResume.map((r) => (
            <div key={r.label} className="flex justify-between border-b border-neutral-800 py-1 text-sm">
              <span>{r.label}</span>
              <span className="text-neutral-400">{r.count}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Applications by company</h2>
        <div className="flex flex-col gap-2">
          {byCompany.length === 0 && <p className="text-neutral-500 text-sm">No applications yet.</p>}
          {byCompany.map(([name, count]) => (
            <div key={name} className="flex justify-between border-b border-neutral-800 py-1 text-sm">
              <span>{name}</span>
              <span className="text-neutral-400">{count}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Recent activity</h2>
        <div className="flex flex-col gap-2">
          {recent.length === 0 && <p className="text-neutral-500 text-sm">Nothing yet — run /auto-apply.</p>}
          {recent.map((a) => (
            <div key={a.id} className="flex justify-between border-b border-neutral-800 py-2 text-sm">
              <div>
                <div className="font-medium">{a.job.title}</div>
                <div className="text-neutral-500">{a.job.company.name} · {a.resumeVariant?.label ?? "—"}</div>
              </div>
              <StatusBadge status={a.status} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-neutral-800 rounded-lg p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-neutral-400 text-sm">{label}</div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    submitted: "bg-green-900 text-green-300",
    ready_for_review: "bg-amber-900 text-amber-300",
    skipped_no_match: "bg-neutral-800 text-neutral-400",
    failed: "bg-red-900 text-red-300",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs h-fit ${colors[status] ?? "bg-neutral-800"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
