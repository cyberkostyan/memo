import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { getPendingCount } from "../offline/event-store";
import { setOnlineCallbacks } from "../api/client";

interface OnlineContextValue {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncAt: Date | null;
  setIsSyncing: (v: boolean) => void;
  setLastSyncAt: (v: Date | null) => void;
  refreshPendingCount: () => Promise<void>;
  reportFetchSuccess: () => void;
  reportFetchError: () => void;
}

const OnlineContext = createContext<OnlineContextValue>(null!);

export function OnlineProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);

  // Listen for browser online/offline events
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Fetch error-based detection
  const reportFetchSuccess = useCallback(() => {
    setIsOnline(true);
  }, []);

  const reportFetchError = useCallback(() => {
    setIsOnline(false);
  }, []);

  const refreshPendingCount = useCallback(async () => {
    const count = await getPendingCount();
    setPendingCount(count);
  }, []);

  // Refresh pending count on mount
  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  useEffect(() => {
    setOnlineCallbacks(reportFetchSuccess, reportFetchError);
  }, [reportFetchSuccess, reportFetchError]);

  return (
    <OnlineContext.Provider
      value={{
        isOnline,
        pendingCount,
        isSyncing,
        lastSyncAt,
        setIsSyncing,
        setLastSyncAt,
        refreshPendingCount,
        reportFetchSuccess,
        reportFetchError,
      }}
    >
      {children}
    </OnlineContext.Provider>
  );
}

export function useOnline() {
  return useContext(OnlineContext);
}
