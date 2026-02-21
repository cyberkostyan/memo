import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { useAnalysis } from "../hooks/useAnalysis";
import { HealthScoreCard } from "../components/analysis/HealthScoreCard";
import { CorrelationCard } from "../components/analysis/CorrelationCard";
import { TrendCard } from "../components/analysis/TrendCard";
import { RecommendationCard } from "../components/analysis/RecommendationCard";
import { AnomalyCard } from "../components/analysis/AnomalyCard";
import { DataGapCard } from "../components/analysis/DataGapCard";
import { ConsentRequired } from "../components/analysis/ConsentRequired";

const PERIODS = [7, 14, 30] as const;

export function AnalysisPage() {
  const [period, setPeriod] = useState<7 | 14 | 30>(7);
  const { result, loading, initialLoading, error, analyze, cachedAt } =
    useAnalysis();

  const handleAnalyze = () => {
    analyze(period);
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

  return (
    <div className="px-4 pt-6 pb-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          <h1 className="text-xl font-bold text-white">AI Analysis</h1>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-2 mb-4">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                period === p
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-slate-300"
              }`}
            >
              {p}d
            </button>
          ))}
        </div>

        {/* Analyze button */}
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="w-full py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-60"
          style={{
            background: loading
              ? undefined
              : "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
            backgroundColor: loading ? "#374151" : undefined,
          }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing your health data...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4" />
              Analyze
            </span>
          )}
        </button>
      </div>

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
            onClick={handleAnalyze}
            className="text-sm text-indigo-400 hover:text-indigo-300"
          >
            Try again
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4 animate-pulse">
          <div className="bg-slate-800/50 rounded-2xl h-44 border border-slate-700/50" />
          <div className="bg-slate-800/50 rounded-xl h-20 border border-slate-700/50" />
          <div className="bg-slate-800/50 rounded-xl h-24 border border-slate-700/50" />
          <div className="bg-slate-800/50 rounded-xl h-24 border border-slate-700/50" />
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-6">
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

          {/* Period info */}
          <p className="text-[11px] text-slate-600 text-center">
            {result.analysis.period.start.split("T")[0]} &mdash;{" "}
            {result.analysis.period.end.split("T")[0]} (
            {result.analysis.period.total_days} days)
            {cachedAt && (
              <>
                {" "}&middot; cached{" "}
                {new Date(cachedAt).toLocaleString()}
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
