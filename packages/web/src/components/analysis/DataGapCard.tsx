import type { AnalysisDataGap } from "@memo/shared";

const ISSUE_ICONS: Record<string, string> = {
  missing: "\u274C",
  insufficient: "\uD83D\uDCCA",
  irregular: "\uD83D\uDD00",
};

export function DataGapCard({ gap }: { gap: AnalysisDataGap }) {
  return (
    <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30">
      <div className="flex items-center gap-2 mb-1">
        <span>{ISSUE_ICONS[gap.issue] ?? "\uD83D\uDCDD"}</span>
        <span className="text-xs font-medium text-slate-400 capitalize">
          {gap.category}
        </span>
        <span className="text-[10px] text-slate-600 px-1.5 py-0.5 rounded bg-slate-800">
          {gap.issue}
        </span>
      </div>
      <p className="text-xs text-slate-500">{gap.suggestion}</p>
    </div>
  );
}
