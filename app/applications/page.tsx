import { prisma } from "@/lib/db";
import { StatusBadge } from "../page";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const applications = await prisma.application.findMany({
    include: { job: { include: { company: true } }, resumeVariant: true },
    orderBy: { appliedAt: "desc" },
  });

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Applications</h1>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-500 border-b border-neutral-800">
              <th className="py-2 pr-4">Job</th>
              <th className="py-2 pr-4">Company</th>
              <th className="py-2 pr-4">Resume</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Date</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((a) => (
              <tr key={a.id} className="border-b border-neutral-900">
                <td className="py-2 pr-4">
                  <a href={a.job.url} target="_blank" className="hover:underline">
                    {a.job.title}
                  </a>
                </td>
                <td className="py-2 pr-4">{a.job.company.name}</td>
                <td className="py-2 pr-4">{a.resumeVariant?.label ?? "—"}</td>
                <td className="py-2 pr-4"><StatusBadge status={a.status} /></td>
                <td className="py-2 pr-4 text-neutral-500">{a.appliedAt.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {applications.length === 0 && (
          <p className="text-neutral-500 text-sm mt-4">No applications recorded yet. Run <code>/auto-apply</code>.</p>
        )}
      </div>
    </div>
  );
}
