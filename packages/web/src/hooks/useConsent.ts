import { useState, useCallback } from "react";
import { api } from "../api/client";
import type { ConsentResponse, ConsentHistoryResponse } from "@memo/shared";

export function useConsent() {
  const [consents, setConsents] = useState<ConsentResponse[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchConsents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<ConsentResponse[]>("/privacy/consents");
      setConsents(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateConsent = useCallback(
    async (type: string, granted: boolean) => {
      const result = await api<ConsentResponse>("/privacy/consents", {
        method: "POST",
        body: JSON.stringify({ type, granted }),
      });
      setConsents((prev) => {
        const existing = prev.findIndex((c) => c.type === type);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = result;
          return updated;
        }
        return [...prev, result];
      });
      return result;
    },
    [],
  );

  const fetchHistory = useCallback(async (limit = 50, offset = 0) => {
    return api<ConsentHistoryResponse>(
      `/privacy/consents/history?limit=${limit}&offset=${offset}`,
    );
  }, []);

  return { consents, loading, fetchConsents, updateConsent, fetchHistory };
}
