export type AtsType = "greenhouse" | "lever" | "ashby" | "workday" | "unknown";

export type FailureReason =
  | "bot_detection"
  | "requires_account"
  | "form_did_not_progress"
  | "timeout"
  | "navigation_error"
  | "unsupported_ats"
  | "submit_not_confirmed"
  | "other";

export type JobStatus = "ready_for_review" | "submitted" | "manual_apply_needed" | "failed";

export type FieldKind = "text" | "textarea" | "select" | "combobox" | "file" | "radio" | "checkbox";

export type DetectedField = {
  label: string;
  kind: FieldKind;
  selector: string;
  required: boolean;
  /** For radio/checkbox groups: the individual option selectors + their labels. */
  groupOptions?: { selector: string; label: string }[];
};

export type JobResult = {
  status: JobStatus;
  screenshotPath?: string;
  notes?: string;
  failureReason?: FailureReason;
  unmatchedRequiredFields?: string[];
  elapsedMs: number;
};

export type FillTarget = {
  jobUrl: string;
  resumePdfPath: string;
  resumeCategory: string;
  state?: string;
  screenshotPath: string;
  submit: boolean; // true only when the company is pre-approved
  /** The company's known ATS (from Company.atsType, established at scrape/
   * validation time) — pass this through rather than letting the engine
   * re-derive it from the job URL's hostname, which is wrong for companies
   * that wrap their Greenhouse/Lever/Ashby form behind their own branded
   * domain (e.g. Databricks' job URLs are databricks.com/..., not
   * job-boards.greenhouse.io, even though the form itself is Greenhouse). */
  atsType?: AtsType;
};
