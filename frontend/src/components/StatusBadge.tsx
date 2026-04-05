type StatusBadgeProps = {
  label: string;
  tone: "safe" | "critical" | "neutral";
};

export function StatusBadge({ label, tone }: StatusBadgeProps) {
  return <span className={`status-badge ${tone}`}>{label}</span>;
}
