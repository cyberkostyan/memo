import type { AnalysisHealthScore } from "@memo/shared";

const TREND_ICONS: Record<string, string> = {
  improving: "\u2191",
  stable: "\u2192",
  declining: "\u2193",
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

const COMPONENT_LABELS: Array<{
  key: keyof AnalysisHealthScore["components"];
  icon: string;
  label: string;
}> = [
  { key: "sleep", icon: "\uD83D\uDE34", label: "Sleep" },
  { key: "nutrition", icon: "\uD83C\uDF7D\uFE0F", label: "Nutrition" },
  { key: "activity", icon: "\uD83C\uDFC3", label: "Activity" },
  { key: "digestion", icon: "\uD83D\uDC8A", label: "Digestion" },
  { key: "mood", icon: "\uD83D\uDE0A", label: "Mood" },
];

export function HealthScoreCard({
  score,
}: {
  score: AnalysisHealthScore;
}) {
  const color = scoreColor(score.value);
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score.value / 100) * circumference;

  return (
    <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
      <h3 className="text-sm font-semibold text-slate-300 mb-4">
        Health Score
      </h3>

      <div className="flex items-center gap-6">
        {/* Circular progress */}
        <div className="relative w-32 h-32 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-slate-700"
            />
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke={color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 1s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-white">
              {score.value}
            </span>
            <span
              className={`text-sm font-medium ${TREND_COLORS[score.trend]}`}
            >
              {TREND_ICONS[score.trend]} {score.trend}
            </span>
          </div>
        </div>

        {/* Components */}
        <div className="flex-1 grid grid-cols-1 gap-2">
          {COMPONENT_LABELS.map(({ key, icon, label }) => {
            const val = score.components[key];
            return (
              <div key={key} className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {icon} {label}
                </span>
                <span
                  className="text-xs font-semibold"
                  style={{ color: val > 0 ? scoreColor(val) : undefined }}
                >
                  {val > 0 ? `${val}` : "\u2014"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
