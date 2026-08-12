import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ResumesPage() {
  const resumes = await prisma.resumeVariant.findMany();

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Resume variants</h1>
      <div className="flex flex-col gap-4">
        {resumes.map((r) => {
          const keywords: string[] = JSON.parse(r.keywords);
          return (
            <div key={r.id} className="border border-neutral-800 rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <h2 className="font-medium">{r.label}</h2>
                <a href={`/${r.pdfPath.replace(/^public\//, "")}`} target="_blank" className="text-sm text-blue-400 hover:underline">
                  View PDF
                </a>
              </div>
              <div className="flex flex-wrap gap-1">
                {keywords.map((k) => (
                  <span key={k} className="text-xs bg-neutral-900 border border-neutral-800 rounded px-2 py-0.5 text-neutral-400">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
