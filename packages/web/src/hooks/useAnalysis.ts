import { useState, useCallback, useEffect } from "react";
import { api, ApiError } from "../api/client";
import type { AnalysisResult, AnalysisHistoryItem } from "@memo/shared";

type AnalysisError =
  | { type: "consent_required" }
  | { type: "no_data"; message: string }
  | { type: "error"; message: string };

export function useAnalysis() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<AnalysisError | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [history, setHistory] = useState<AnalysisHistoryItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const data = await api<AnalysisHistoryItem[]>("/analysis/history");
      setHistory(data);
    } catch {
      // Silently ignore
    }
  }, []);

  // Load latest cached result + history on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [latestData, historyData] = await Promise.all([
          api<any>("/analysis/latest"),
          api<AnalysisHistoryItem[]>("/analysis/history").catch(() => []),
        ]);
        if (cancelled) return;
        if (latestData.cached && latestData.analysis) {
          setResult(latestData as AnalysisResult);
          setCachedAt(latestData.cachedAt ?? null);
        }
        setHistory(historyData);
      } catch {
        // Silently ignore
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const analyze = useCallback(async (focus: string[] | null = null) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setCachedAt(null);
    setActiveId(null);

    try {
      const data = await api<AnalysisResult>("/analysis", {
        method: "POST",
        body: JSON.stringify({ period: 7, focus }),
      });
      setResult(data);
      setCachedAt(null);
      // Refresh history after new analysis
      const historyData = await api<AnalysisHistoryItem[]>("/analysis/history").catch(() => []);
      setHistory(historyData);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) {
          setError({ type: "consent_required" });
        } else if (err.status === 400) {
          setError({ type: "no_data", message: err.message });
        } else {
          setError({ type: "error", message: err.message });
        }
      } else {
        setError({
          type: "error",
          message: "An unexpected error occurred",
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadById = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    setActiveId(id);

    try {
      const data = await api<any>(`/analysis/${id}`);
      setResult(data as AnalysisResult);
      setCachedAt(data.cachedAt ?? null);
    } catch (err) {
      if (err instanceof ApiError) {
        setError({ type: "error", message: err.message });
      } else {
        setError({ type: "error", message: "Failed to load analysis" });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLatest = useCallback(async () => {
    setActiveId(null);
    setLoading(true);
    setError(null);

    try {
      const data = await api<any>("/analysis/latest");
      if (data.cached && data.analysis) {
        setResult(data as AnalysisResult);
        setCachedAt(data.cachedAt ?? null);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setCachedAt(null);
    setActiveId(null);
  }, []);

  return {
    result,
    loading,
    initialLoading,
    error,
    analyze,
    reset,
    cachedAt,
    history,
    activeId,
    loadById,
    loadLatest,
    fetchHistory,
  };
}
