import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { getPendingCount } from "../offline/event-store";
import { setOnlineCallbacks } from "../api/client";
import { syncPendingOps } from "../offline/sync-manager";
import { useAuth } from "../auth/AuthContext";

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

  const { user } = useAuth();

  // Sync helper
  const doSync = useCallback((userId: string) => {
    syncPendingOps({
      userId,
      onSyncStart: () => setIsSyncing(true),
      onSyncEnd: () => {
        setIsSyncing(false);
        setLastSyncAt(new Date());
      },
      onPendingCountChange: refreshPendingCount,
      onEventsChanged: () => {},
    });
  }, [refreshPendingCount]);

  // Trigger sync when going online
  const prevOnline = useRef(isOnline);
  useEffect(() => {
    if (isOnline && !prevOnline.current && user?.id) {
      doSync(user.id);
    }
    prevOnline.current = isOnline;
  }, [isOnline, user?.id, doSync]);

  // On mount: sync if online and have pending ops
  useEffect(() => {
    if (!isOnline || !user?.id) return;
    getPendingCount().then((count) => {
      if (count > 0) doSync(user.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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
