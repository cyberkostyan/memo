import type { AnalysisHistoryItem } from "@memo/shared";

const TREND_ICONS: Record<string, string> = {
  improving: "↑",
  stable: "→",
  declining: "↓",
};

const TREND_COLORS: Record<string, string> = {
  improving: "text-green-400",
  stable: "text-slate-400",
  declining: "text-red-400",
};

function scoreColor(value: number): string {
  if (value >= 70) return "#10B981";
  if (value >= 40) return "#F59E0B";
  return "#EF4444";
}

export function AnalysisHistoryCard({
  item,
  isActive,
  onClick,
}: {
  item: AnalysisHistoryItem;
  isActive: boolean;
  onClick: () => void;
}) {
  const date = new Date(item.createdAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

  const periodDays = Math.round(
    (new Date(item.periodEnd).getTime() - new Date(item.periodStart).getTime()) /
      (1000 * 60 * 60 * 24),
  );

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-colors ${
        isActive
          ? "bg-indigo-900/30 border-indigo-500/50"
          : "bg-slate-800/50 border-slate-700/50 active:bg-slate-700/50"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Health score badge */}
          {item.healthScore != null && (
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: scoreColor(item.healthScore) + "20" }}
            >
              <span
                className="text-sm font-bold"
                style={{ color: scoreColor(item.healthScore) }}
              >
                {item.healthScore}
              </span>
            </div>
          )}

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-white">{date}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                {periodDays}d
              </span>
              {item.trend && (
                <span className={`text-xs ${TREND_COLORS[item.trend]}`}>
                  {TREND_ICONS[item.trend]}
                </span>
              )}
            </div>
            {item.summary && (
              <p className="text-xs text-slate-500 truncate mt-0.5">
                {item.summary}
              </p>
            )}
          </div>
        </div>

        {item.entryCount != null && (
          <span className="text-[10px] text-slate-600 shrink-0">
            {item.entryCount} entries
          </span>
        )}
      </div>
    </button>
  );
}
