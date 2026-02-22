import type { AnalysisLabResult } from "@memo/shared";

const STATUS_STYLES: Record<string, string> = {
  high: "text-red-400",
  low: "text-amber-400",
  normal: "text-emerald-400",
};

const STATUS_LABEL: Record<string, string> = {
  high: "HIGH",
  low: "LOW",
  normal: "",
};

export function LabResultCard({ lab }: { lab: AnalysisLabResult }) {
  const outOfRange = lab.values.filter((v) => v.status !== "normal");

  return (
    <div className="bg-slate-800/50 rounded-xl p-4 border border-indigo-500/20">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <span className="text-sm font-medium text-white">
            {lab.test_name}
          </span>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {new Date(lab.date).toLocaleDateString()} · from {lab.source_type}
          </p>
        </div>
        {outOfRange.length > 0 && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
            {outOfRange.length} out of range
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {lab.values.map((v, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="text-slate-400">{v.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-[11px]">
                {v.reference_range} {v.unit}
              </span>
              <span className={`font-medium tabular-nums ${STATUS_STYLES[v.status] ?? STATUS_STYLES.normal}`}>
                {v.value} {v.unit}
              </span>
              {STATUS_LABEL[v.status] && (
                <span className={`text-[9px] font-bold ${STATUS_STYLES[v.status]}`}>
                  {STATUS_LABEL[v.status]}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {lab.notes && (
        <p className="text-xs text-slate-400 mt-3 pt-2 border-t border-slate-700/50">
          {lab.notes}
        </p>
      )}
    </div>
  );
}
