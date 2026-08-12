import { prisma } from "@/lib/db";
import { StatusBadge } from "../components/StatusBadge";
import { screenshotUrl } from "@/lib/screenshotUrl";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const applications = await prisma.application.findMany({
    include: { job: { include: { company: true } }, resumeVariant: true },
    orderBy: { appliedAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="text-xs font-mono uppercase tracking-widest text-text-faint mb-1">
          {applications.length} total
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
      </div>

      <p className="text-text-muted text-sm">
        Screenshots (the &quot;flight recorder&quot; of each filled form) live under{" "}
        <code className="text-text bg-surface-raised px-1.5 py-0.5 rounded font-mono text-xs">public/screenshots/&lt;company-slug&gt;/</code>{" "}
        on disk — click the thumbnail below to open the full one in a new tab.
      </p>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-text-faint font-mono text-xs uppercase tracking-wide border-b border-border">
              <th className="py-3 px-4">Screenshot</th>
              <th className="py-3 px-4">Job</th>
              <th className="py-3 px-4">Company</th>
              <th className="py-3 px-4">Resume</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Date</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((a) => {
              const shot = screenshotUrl(a.screenshotPath);
              return (
                <tr key={a.id} className="border-b border-border-soft last:border-0 hover:bg-surface-raised/50 transition-colors">
                  <td className="py-2 px-4">
                    {shot ? (
                      <a href={shot} target="_blank" title="Open full screenshot">
                        <img
                          src={shot}
                          alt={`Screenshot of ${a.job.title} application`}
                          className="w-14 h-14 object-cover object-top rounded border border-border hover:border-accent transition-colors"
                        />
                      </a>
                    ) : (
                      <div className="w-14 h-14 rounded border border-dashed border-border-soft flex items-center justify-center text-text-faint text-[10px] font-mono text-center leading-tight">
                        no shot
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-4 max-w-[260px]">
                    <a href={a.job.url} target="_blank" className="link-row">
                      {a.job.title}
                    </a>
                  </td>
                  <td className="py-2 px-4">{a.job.company.name}</td>
                  <td className="py-2 px-4 text-text-muted">{a.resumeVariant?.label ?? "—"}</td>
                  <td className="py-2 px-4"><StatusBadge status={a.status} /></td>
                  <td className="py-2 px-4 text-text-faint data-cell text-xs">{a.appliedAt.toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {applications.length === 0 && (
          <p className="text-text-faint text-sm p-6">No applications recorded yet. Run <code className="font-mono">/auto-apply</code>.</p>
        )}
      </div>
    </div>
  );
}
