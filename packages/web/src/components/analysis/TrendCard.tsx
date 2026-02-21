import type { AnalysisTrend } from "@memo/shared";

const DIRECTION_CONFIG: Record<string, { icon: string; color: string }> = {
  improving: { icon: "📈", color: "text-green-400" },
  declining: { icon: "📉", color: "text-red-400" },
  stable: { icon: "➡️", color: "text-slate-400" },
  cyclical: { icon: "🔄", color: "text-amber-400" },
};

export function TrendCard({ trend }: { trend: AnalysisTrend }) {
  const dir = DIRECTION_CONFIG[trend.direction] ?? DIRECTION_CONFIG.stable;

  return (
    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span>{dir.icon}</span>
          <span className="text-sm font-medium text-white capitalize">
            {trend.category}: {trend.metric}
          </span>
        </div>
        <span className={`text-xs font-semibold ${dir.color}`}>
          {trend.direction}
        </span>
      </div>

      <p className="text-xs text-slate-300 mb-3">{trend.description}</p>

      {trend.data_points.length > 0 && (
        <div className="flex items-end gap-1 h-8">
          {trend.data_points.map((dp, i) => {
            const max = Math.max(...trend.data_points.map((d) => d.value));
            const height = max > 0 ? (dp.value / max) * 100 : 0;
            return (
              <div
                key={i}
                className="flex-1 rounded-sm bg-indigo-500/30"
                style={{ height: `${Math.max(height, 10)}%` }}
                title={`${dp.date}: ${dp.value}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
