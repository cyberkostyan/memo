import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import type { DailyTip } from "@memo/shared";

const DISMISS_KEY = "tip-dismissed";

export function useDailyTip() {
  const [tips, setTips] = useState<DailyTip[]>([]);
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(() => {
    const stored = localStorage.getItem(DISMISS_KEY);
    return stored === new Date().toDateString();
  });

  useEffect(() => {
    if (dismissed) return;
    api<{ tips: DailyTip[] }>("/analysis/daily-tip")
      .then((data) => {
        if (data.tips.length > 0) setTips(data.tips);
      })
      .catch(() => {});
  }, [dismissed]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, new Date().toDateString());
  }, []);

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % tips.length);
  }, [tips.length]);

  const tip = dismissed || tips.length === 0 ? null : tips[index];
  const total = tips.length;
  const current = index + 1;

  return { tip, total, current, dismiss, next };
}
