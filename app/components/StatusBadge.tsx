const SIGNAL_CLASS: Record<string, string> = {
  submitted: "signal-submitted",
  ready_for_review: "signal-review",
  manual_apply_needed: "signal-manual",
  failed: "signal-failed",
  skipped_no_match: "signal-skipped",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`signal ${SIGNAL_CLASS[status] ?? "signal-skipped"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
