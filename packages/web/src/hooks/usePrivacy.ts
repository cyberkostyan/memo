import { useState, useCallback } from "react";
import { api, apiDownload } from "../api/client";
import type { DeletionRequestResponse, AuditLogResponse } from "@memo/shared";

export function usePrivacy() {
  const [deletionRequest, setDeletionRequest] =
    useState<DeletionRequestResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const exportData = useCallback(async () => {
    await apiDownload("/privacy/export");
  }, []);

  const requestDeletion = useCallback(
    async (password: string, reason?: string) => {
      const result = await api<DeletionRequestResponse>(
        "/privacy/delete-request",
        {
          method: "POST",
          body: JSON.stringify({ password, reason }),
        },
      );
      setDeletionRequest(result);
      return result;
    },
    [],
  );

  const cancelDeletion = useCallback(async () => {
    await api("/privacy/delete-request", { method: "DELETE" });
    setDeletionRequest(null);
  }, []);

  const fetchDeletionStatus = useCallback(async () => {
    setLoading(true);
    try {
      const result =
        await api<DeletionRequestResponse | null>("/privacy/delete-request");
      setDeletionRequest(result);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAuditLog = useCallback(async (limit = 50, offset = 0) => {
    return api<AuditLogResponse>(
      `/privacy/audit-log?limit=${limit}&offset=${offset}`,
    );
  }, []);

  return {
    deletionRequest,
    loading,
    exportData,
    requestDeletion,
    cancelDeletion,
    fetchDeletionStatus,
    fetchAuditLog,
  };
}
