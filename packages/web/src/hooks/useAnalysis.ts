import { useState, useCallback, useEffect } from "react";
import { api, ApiError } from "../api/client";
import type { AnalysisResult } from "@memo/shared";

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

  // Load latest cached result on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api<any>("/analysis/latest");
        if (!cancelled && data.cached && data.analysis) {
          setResult(data as AnalysisResult);
          setCachedAt(data.cachedAt ?? null);
        }
      } catch {
        // Silently ignore — user just hasn't analyzed yet or no consent
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const analyze = useCallback(
    async (period: 7 | 14 | 30, focus: string[] | null = null) => {
      setLoading(true);
      setError(null);
      setResult(null);
      setCachedAt(null);

      try {
        const data = await api<AnalysisResult>("/analysis", {
          method: "POST",
          body: JSON.stringify({ period, focus }),
        });
        setResult(data);
        setCachedAt(null);
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
    },
    [],
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
    setCachedAt(null);
  }, []);

  return { result, loading, initialLoading, error, analyze, reset, cachedAt };
}
