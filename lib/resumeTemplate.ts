type SkillGroup = { label: string; items: string[] };
export type Bullet = { text: string; tags: string[]; priority: number };
type Subsection = { heading?: string; bullets: Bullet[] };
type ExperienceEntry = { title: string; location: string; dates: string; subsections: Subsection[] };

export type ResumeContent = {
  name: string;
  contact: {
    email: string;
    phone: string;
    location: string;
    linkedinLabel: string;
    linkedinUrl: string;
    githubLabel: string;
    githubUrl: string;
  };
  skillGroups: Record<string, SkillGroup>;
  experience: ExperienceEntry[];
  education: { school: string; dates: string }[];
  certifications: { label: string }[];
  categories: Record<string, { summary: string; skillOrder: string[] }>;
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderResumeHtml(content: ResumeContent, category: string): string {
  const cat = content.categories[category];
  if (!cat) throw new Error(`Unknown resume category: ${category}`);

  const skillsHtml = cat.skillOrder
    .map((key) => {
      const group = content.skillGroups[key];
      return `<div class="skill-row"><span class="skill-label">${esc(group.label)}:</span> ${esc(
        group.items.join(" | ")
      )}</div>`;
    })
    .join("\n");

  const experienceHtml = content.experience
    .map((job) => {
      const subsectionsHtml = job.subsections
        .map(
          (sub) => `
        ${sub.heading ? `<div class="sub-heading">${esc(sub.heading)}</div>` : ""}
        <ul>${sub.bullets.map((b) => `<li>${esc(b.text)}</li>`).join("")}</ul>
      `
        )
        .join("");
      return `
      <div class="job">
        <div class="job-header">
          <span class="job-title">${esc(job.title)}</span>
          <span class="job-dates">${esc(job.location)} | ${esc(job.dates)}</span>
        </div>
        ${subsectionsHtml}
      </div>`;
    })
    .join("");

  const educationHtml = content.education
    .map((e) => `<div class="edu-row">${esc(e.school)} | ${esc(e.dates)}</div>`)
    .join("");

  const certsHtml = content.certifications.map((c) => `<li>${esc(c.label)}</li>`).join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: Letter; margin: 0.32in 0.5in; }
  * { box-sizing: border-box; }
  body {
    font-family: Calibri, Arial, "Helvetica Neue", sans-serif;
    color: #1a1a1a;
    font-size: 8.7pt;
    line-height: 1.18;
  }
  .name { text-align: center; font-size: 18.5pt; font-weight: 700; color: #1a3a6b; margin-bottom: 1px; }
  .contact { text-align: center; font-size: 8.4pt; margin-bottom: 6px; }
  .contact a { color: #1a1a1a; text-decoration: none; }
  .contact a:hover { text-decoration: underline; }
  .sep { margin: 0 4px; color: #555; }
  h2 {
    font-size: 9.6pt; font-weight: 700; color: #1a3a6b; text-transform: uppercase;
    border-bottom: 1.2px solid #1a3a6b; padding-bottom: 1px; margin: 6px 0 3px 0;
    letter-spacing: 0.2px;
  }
  .summary { text-align: justify; margin-bottom: 1px; }
  .skill-row { margin-bottom: 1px; }
  .skill-label { font-weight: 700; }
  .job { margin-bottom: 3px; }
  .job-header { display: flex; justify-content: space-between; font-weight: 700; }
  .job-dates { font-weight: 400; font-style: italic; white-space: nowrap; }
  .sub-heading { font-style: italic; font-weight: 600; margin-top: 2px; }
  ul { margin: 1px 0 0 0; padding-left: 15px; }
  li { margin-bottom: 0.5px; }
  .edu-row { margin-bottom: 1px; }
  .certs { margin: 1px 0 0 0; padding-left: 15px; }
</style>
</head>
<body>
  <div class="name">${esc(content.name)}</div>
  <div class="contact">
    <a href="mailto:${esc(content.contact.email)}">${esc(content.contact.email)}</a><span class="sep">|</span>${esc(content.contact.phone)}<span class="sep">|</span>${esc(content.contact.location)}<span class="sep">|</span><a href="${esc(content.contact.linkedinUrl)}">${esc(content.contact.linkedinLabel)}</a><span class="sep">|</span><a href="${esc(content.contact.githubUrl)}">${esc(content.contact.githubLabel)}</a>
  </div>

  <h2>Professional Summary</h2>
  <div class="summary">${esc(cat.summary)}</div>

  <h2>Skills</h2>
  ${skillsHtml}

  <h2>Work Experience</h2>
  ${experienceHtml}

  <h2>Education</h2>
  ${educationHtml}

  <h2>Certifications</h2>
  <ul class="certs">${certsHtml}</ul>
</body>
</html>`;
}
