import { useState } from "react";
import { Sparkles, Loader2, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { useAnalysis } from "../hooks/useAnalysis";
import { useOnline } from "../contexts/OnlineContext";

type Period = 7 | 14 | 30 | 90;
const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];
import { HealthScoreCard } from "../components/analysis/HealthScoreCard";
import { CorrelationCard } from "../components/analysis/CorrelationCard";
import { TrendCard } from "../components/analysis/TrendCard";
import { RecommendationCard } from "../components/analysis/RecommendationCard";
import { AnomalyCard } from "../components/analysis/AnomalyCard";
import { DataGapCard } from "../components/analysis/DataGapCard";
import { ConsentRequired } from "../components/analysis/ConsentRequired";
import { AnalysisHistoryCard } from "../components/analysis/AnalysisHistoryCard";

export function AnalysisPage() {
  const {
    result,
    loading,
    initialLoading,
    error,
    analyze,
    cachedAt,
    history,
    activeId,
    loadById,
    loadLatest,
  } = useAnalysis();
  const { isOnline } = useOnline();
  const [period, setPeriod] = useState<Period>(7);

  const handleAnalyze = (p: Period = period) => {
    if (!isOnline) {
      toast.error("This feature requires an internet connection");
      return;
    }
    analyze(p);
  };

  // Consent required
  if (error?.type === "consent_required") {
    return (
      <div className="px-4 pt-6 pb-6">
        <ConsentRequired />
      </div>
    );
  }

  // Initial loading (checking for cached result)
  if (initialLoading) {
    return (
      <div className="px-4 pt-6 pb-8">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          <h1 className="text-xl font-bold text-white">AI Analysis</h1>
        </div>
        <div className="space-y-4 animate-pulse">
          <div className="bg-slate-800/50 rounded-2xl h-44 border border-slate-700/50" />
          <div className="bg-slate-800/50 rounded-xl h-20 border border-slate-700/50" />
        </div>
      </div>
    );
  }

  // Empty state — no cached result and not loading
  const showEmptyState = !result && !loading && !error;

  return (
    <div className="px-4 pt-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          <h1 className="text-xl font-bold text-white">AI Analysis</h1>
        </div>
        {result && !loading && (
          <div className="flex items-center gap-2">
            <select
              value={period}
              onChange={(e) => setPeriod(Number(e.target.value) as Period)}
              className="bg-slate-800 text-xs text-slate-400 border border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              onClick={() => handleAnalyze()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-400 bg-indigo-500/10 active:bg-indigo-500/20 transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
              Analyze
            </button>
          </div>
        )}
      </div>

      {/* Empty state */}
      {showEmptyState && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center mx-auto mb-4">
            <Sparkles className="w-8 h-8 text-indigo-400" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">
            Health Insights
          </h2>
          <p className="text-sm text-slate-400 mb-6 max-w-[260px] mx-auto">
            Analyze your data to discover patterns, correlations, and personalized recommendations.
          </p>

          {/* Period selector */}
          <div className="flex justify-center gap-2 mb-4">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  period === opt.value
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-800 text-slate-400 hover:text-slate-300"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => handleAnalyze()}
            className="px-6 py-3 rounded-xl font-semibold text-white transition-all"
            style={{
              background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
            }}
          >
            <span className="flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4" />
              Analyze last {period} days
            </span>
          </button>
        </div>
      )}

      {/* Error states */}
      {error?.type === "no_data" && (
        <div className="text-center py-12">
          <p className="text-slate-400 text-sm mb-2">Not enough data</p>
          <p className="text-slate-500 text-xs">{error.message}</p>
        </div>
      )}

      {error?.type === "error" && (
        <div className="text-center py-12">
          <p className="text-red-400 text-sm mb-3">{error.message}</p>
          <button
            onClick={() => handleAnalyze()}
            className="text-sm text-indigo-400 hover:text-indigo-300"
          >
            Try again
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4">
          <div className="flex items-center justify-center gap-2 py-4 text-slate-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Analyzing your health data...
          </div>
          <div className="space-y-4 animate-pulse">
            <div className="bg-slate-800/50 rounded-2xl h-44 border border-slate-700/50" />
            <div className="bg-slate-800/50 rounded-xl h-20 border border-slate-700/50" />
            <div className="bg-slate-800/50 rounded-xl h-24 border border-slate-700/50" />
            <div className="bg-slate-800/50 rounded-xl h-24 border border-slate-700/50" />
          </div>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-6">
          {/* Viewing old analysis indicator */}
          {activeId && (
            <div className="flex items-center justify-between bg-indigo-900/20 border border-indigo-500/30 rounded-xl px-4 py-2.5">
              <span className="text-xs text-indigo-300">
                Viewing previous analysis
              </span>
              <button
                onClick={loadLatest}
                className="text-xs font-medium text-indigo-400 active:text-indigo-300"
              >
                Back to latest
              </button>
            </div>
          )}

          {/* Health Score */}
          <HealthScoreCard score={result.analysis.health_score} />

          {/* Summary */}
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
            <p className="text-sm text-slate-300 leading-relaxed">
              {result.analysis.summary}
            </p>
          </div>

          {/* Correlations */}
          {result.analysis.correlations.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-300 mb-3">
                Correlations
              </h2>
              <div className="space-y-3">
                {result.analysis.correlations.map((c) => (
                  <CorrelationCard key={c.id} correlation={c} />
                ))}
              </div>
            </section>
          )}

          {/* Trends */}
          {result.analysis.trends.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-300 mb-3">
                Trends
              </h2>
              <div className="space-y-3">
                {result.analysis.trends.map((t) => (
                  <TrendCard key={t.id} trend={t} />
                ))}
              </div>
            </section>
          )}

          {/* Anomalies */}
          {result.analysis.anomalies.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-300 mb-3">
                Anomalies
              </h2>
              <div className="space-y-3">
                {result.analysis.anomalies.map((a) => (
                  <AnomalyCard key={a.id} anomaly={a} />
                ))}
              </div>
            </section>
          )}

          {/* Recommendations */}
          {result.analysis.recommendations.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-300 mb-3">
                Recommendations
              </h2>
              <div className="space-y-3">
                {result.analysis.recommendations.map((r) => (
                  <RecommendationCard key={r.id} recommendation={r} />
                ))}
              </div>
            </section>
          )}

          {/* Data Gaps */}
          {result.analysis.data_gaps.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-300 mb-3">
                Data Quality Notes
              </h2>
              <div className="space-y-2">
                {result.analysis.data_gaps.map((g, i) => (
                  <DataGapCard key={i} gap={g} />
                ))}
              </div>
            </section>
          )}

          {/* Meta info */}
          <p className="text-[11px] text-slate-600 text-center leading-relaxed">
            {result.analysis.period.start.split("T")[0]} &mdash;{" "}
            {result.analysis.period.end.split("T")[0]} (
            {result.analysis.period.total_days} days)
            {result.meta?.entryCount != null && (
              <>
                {" "}&middot; {result.meta.entryCount} entries
              </>
            )}
            {(result.meta?.analyzedAt || cachedAt) && (
              <>
                <br />
                analyzed{" "}
                {new Date(
                  result.meta?.analyzedAt || cachedAt!,
                ).toLocaleString()}
              </>
            )}
          </p>
        </div>
      )}

      {/* History section */}
      {history.length > 0 && !loading && (
        <section className={result ? "mt-8" : "mt-4"}>
          <h2 className="text-sm font-semibold text-slate-300 mb-3">
            Previous Analyses
          </h2>
          <div className="space-y-2">
            {history.map((item) => (
              <AnalysisHistoryCard
                key={item.id}
                item={item}
                isActive={activeId === item.id}
                onClick={() => loadById(item.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
