import type { AnalysisAnomaly } from "@memo/shared";

const SEVERITY_STYLES: Record<string, { border: string; badge: string }> = {
  alert: {
    border: "border-red-500/30",
    badge: "bg-red-500/20 text-red-300",
  },
  warning: {
    border: "border-amber-500/30",
    badge: "bg-amber-500/20 text-amber-300",
  },
  info: {
    border: "border-slate-700/50",
    badge: "bg-slate-500/20 text-slate-400",
  },
};

export function AnomalyCard({ anomaly }: { anomaly: AnalysisAnomaly }) {
  const style = SEVERITY_STYLES[anomaly.severity] ?? SEVERITY_STYLES.info;

  return (
    <div className={`bg-slate-800/50 rounded-xl p-4 border ${style.border}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-sm font-medium text-white">
          ⚠️ {anomaly.category}
        </span>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${style.badge}`}
        >
          {anomaly.severity}
        </span>
      </div>

      <p className="text-xs text-slate-300 mb-2">{anomaly.description}</p>

      <p className="text-[11px] text-slate-500">
        {new Date(anomaly.date).toLocaleDateString()}
      </p>
    </div>
  );
}
