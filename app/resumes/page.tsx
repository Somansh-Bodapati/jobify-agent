import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ResumesPage() {
  const resumes = await prisma.resumeVariant.findMany();

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <div className="text-xs font-mono uppercase tracking-widest text-text-faint mb-1">{resumes.length} variants</div>
        <h1 className="text-2xl font-semibold tracking-tight">Resumes</h1>
      </div>
      <div className="flex flex-col gap-3">
        {resumes.map((r) => {
          const keywords: string[] = JSON.parse(r.keywords);
          return (
            <div key={r.id} className="card p-5">
              <div className="flex justify-between items-center mb-3">
                <h2 className="font-medium">{r.label}</h2>
                <a
                  href={`/${r.pdfPath.replace(/^public\//, "")}`}
                  target="_blank"
                  className="text-xs font-mono uppercase tracking-wide text-accent hover:brightness-110 border border-accent/30 rounded-full px-3 py-1 transition-colors"
                >
                  View PDF ↗
                </a>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((k) => (
                  <span key={k} className="text-xs bg-surface-raised border border-border rounded px-2 py-0.5 text-text-muted font-mono">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
        {resumes.length === 0 && (
          <p className="text-text-faint text-sm">
            No resume variants yet. Run <code className="font-mono">npm run setup</code>.
          </p>
        )}
      </div>
    </div>
  );
}
