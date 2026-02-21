import type { AnalysisCorrelation } from "@memo/shared";

const STRENGTH_COLORS: Record<string, string> = {
  strong: "bg-indigo-500/20 text-indigo-300",
  moderate: "bg-amber-500/20 text-amber-300",
  weak: "bg-slate-500/20 text-slate-400",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-green-400",
  medium: "text-amber-400",
  low: "text-slate-500",
};

export function CorrelationCard({
  correlation,
}: {
  correlation: AnalysisCorrelation;
}) {
  const isPositive = correlation.direction === "positive";

  return (
    <div
      className={`bg-slate-800/50 rounded-xl p-4 border ${
        isPositive ? "border-green-500/20" : "border-red-500/20"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span
            className={`text-lg ${isPositive ? "text-green-400" : "text-red-400"}`}
          >
            {isPositive ? "\u2197" : "\u2198"}
          </span>
          <span className="text-sm font-medium text-white">
            {correlation.factor_a.category} \u2192 {correlation.factor_b.category}
          </span>
        </div>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            STRENGTH_COLORS[correlation.strength]
          }`}
        >
          {correlation.strength}
        </span>
      </div>

      <p className="text-xs text-slate-300 mb-2">
        {correlation.description}
      </p>

      {correlation.example && (
        <p className="text-[11px] text-slate-500 italic mb-2">
          {correlation.example}
        </p>
      )}

      <div className="flex items-center gap-3 text-[10px]">
        <span className={CONFIDENCE_COLORS[correlation.confidence]}>
          {correlation.confidence} confidence
        </span>
        <span className="text-slate-600">
          {correlation.data_points} data points
        </span>
      </div>
    </div>
  );
}
