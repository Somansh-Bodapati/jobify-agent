import { existsSync, readFileSync } from "fs";
import { join } from "path";

export default function ProfilePage() {
  const localPath = join(process.cwd(), "config/profile.local.json");
  const usingLocal = existsSync(localPath);
  const path = usingLocal ? localPath : join(process.cwd(), "config/profile.example.json");
  const profile = JSON.parse(readFileSync(path, "utf-8"));

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Profile</h1>
      {!usingLocal && (
        <div className="border border-amber-800 bg-amber-950 text-amber-300 text-sm rounded-lg p-3">
          No config/profile.local.json found — showing placeholder values. Real applications will fail
          field-matching until this file is filled in.
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
      <p className="text-neutral-500 text-xs">
        Edit <code>config/profile.local.json</code> directly to update these values (gitignored, never pushed).
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-neutral-800 rounded-lg p-4">
      <h2 className="font-medium mb-3">{title}</h2>
      <div className="flex flex-col gap-1">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-neutral-500">{label}</span>
      <span>{value}</span>
    </div>
  );
}
