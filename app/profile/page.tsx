import { existsSync, readFileSync } from "fs";
import { join } from "path";

export default function ProfilePage() {
  const localPath = join(process.cwd(), "config/profile.local.json");
  const usingLocal = existsSync(localPath);
  const path = usingLocal ? localPath : join(process.cwd(), "config/profile.example.json");
  const profile = JSON.parse(readFileSync(path, "utf-8"));

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <div className="text-xs font-mono uppercase tracking-widest text-text-faint mb-1">Pilot record</div>
        <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
      </div>
      {!usingLocal && (
        <div className="card border-l-2 p-4 text-sm" style={{ borderLeftColor: "var(--status-review)" }}>
          <span style={{ color: "var(--status-review)" }} className="font-mono text-xs uppercase tracking-wide">Placeholder data</span>
          <p className="text-text-muted mt-1">
            No <code className="font-mono text-text">config/profile.local.json</code> found — real applications will fail field-matching until this file is filled in.
          </p>
        </div>
      )}
      <Section title="Contact">
        <Field label="Name" value={`${profile.firstName} ${profile.lastName}`} />
        <Field label="Email" value={profile.email} />
        <Field label="Phone" value={profile.phone} />
        <Field label="Location" value={`${profile.city}, ${profile.state}`} />
        <Field label="LinkedIn" value={profile.linkedin} />
        <Field label="GitHub" value={profile.github} />
      </Section>
      <Section title="Work authorization">
        <Field label="Authorized to work in US" value={String(profile.workAuthorization.authorizedToWorkInUS)} />
        <Field label="Needs sponsorship (future)" value={String(profile.workAuthorization.requiresSponsorshipFuture)} />
      </Section>
      <Section title="Self-identification">
        <Field label="Gender" value={profile.selfIdentification.gender} />
        <Field label="Race/ethnicity" value={profile.selfIdentification.raceEthnicity} />
        <Field label="Veteran status" value={profile.selfIdentification.veteranStatus} />
        <Field label="Disability status" value={profile.selfIdentification.disabilityStatus} />
      </Section>
      <Section title="Availability">
        <Field label="Notice period" value={profile.availability.noticePeriod} />
        <Field label="Open to relocation" value={String(profile.availability.relocation)} />
        <Field label="Open to remote" value={String(profile.availability.remote)} />
      </Section>
      <Section title="Salary tiers by state">
        {Object.entries(profile.salary.tiers as Record<string, { low: number; high: number }>).map(
          ([state, tier]) => (
            <Field key={state} label={state} value={`$${tier.low.toLocaleString()}–$${tier.high.toLocaleString()}`} />
          )
        )}
      </Section>
      <p className="text-text-faint text-xs">
        Edit <code className="font-mono">config/profile.local.json</code> directly to update these values (gitignored, never pushed).
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="text-sm font-mono uppercase tracking-wide text-text-muted mb-3">{title}</h2>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm py-1.5 border-b border-border-soft last:border-0">
      <span className="text-text-muted">{label}</span>
      <span className="data-cell">{value}</span>
    </div>
  );
}
