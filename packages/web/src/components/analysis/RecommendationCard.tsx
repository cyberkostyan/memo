import type { AnalysisRecommendation } from "@memo/shared";

const PRIORITY_STYLES: Record<string, string> = {
  high: "border-indigo-500/40 bg-indigo-500/5",
  medium: "border-amber-500/30 bg-amber-500/5",
  low: "border-slate-700/50 bg-slate-800/50",
};

const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-indigo-500/20 text-indigo-300",
  medium: "bg-amber-500/20 text-amber-300",
  low: "bg-slate-500/20 text-slate-400",
};

export function RecommendationCard({
  recommendation,
}: {
  recommendation: AnalysisRecommendation;
}) {
  return (
    <div
      className={`rounded-xl p-4 border ${
        PRIORITY_STYLES[recommendation.priority]
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-sm font-medium text-white">
          {recommendation.title}
        </span>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
            PRIORITY_BADGE[recommendation.priority]
          }`}
        >
          {recommendation.priority}
        </span>
      </div>

      <p className="text-xs text-slate-300">{recommendation.description}</p>
    </div>
  );
}
