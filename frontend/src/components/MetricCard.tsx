import { ReactNode } from "react";

type MetricCardProps = {
  title: string;
  value: string;
  helper: string;
  accent: "safe" | "critical" | "neutral";
  icon?: ReactNode;
};

export function MetricCard({ title, value, helper, accent, icon }: MetricCardProps) {
  return (
    <article className={`metric-card ${accent}`}>
      <div className="metric-card__header">
        <span>{title}</span>
        <span className="metric-card__icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <p>{helper}</p>
    </article>
  );
}
