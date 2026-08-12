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
};
