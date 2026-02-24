import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import type { DailyTip } from "@memo/shared";

const DISMISS_KEY = "tip-dismissed";

export function useDailyTip() {
  const [tip, setTip] = useState<DailyTip | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    const stored = localStorage.getItem(DISMISS_KEY);
    return stored === new Date().toDateString();
  });

  useEffect(() => {
    if (dismissed) return;
    api<{ tip: DailyTip | null }>("/analysis/daily-tip")
      .then((data) => setTip(data.tip))
      .catch(() => {});
  }, [dismissed]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, new Date().toDateString());
  }, []);

  return { tip: dismissed ? null : tip, dismiss };
}
