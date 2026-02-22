# Offline Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable full CRUD offline support for events — users can create, read, edit, and delete events without network, with automatic sync on reconnect.

**Architecture:** IndexedDB (via `idb` library) stores a local events cache and a pending operations queue. An `OnlineContext` tracks connectivity state (navigator.onLine + fetch errors). A `SyncManager` replays pending ops sequentially when online. The existing `useEvents` hook and `api/client.ts` are modified to route through the offline store when offline.

**Tech Stack:** React 19, `idb` (~1.5KB), IndexedDB, Motion (animations), Sonner (toasts)

---

### Task 1: Install `idb` dependency

**Files:**
- Modify: `packages/web/package.json`

**Step 1: Install idb**

Run: `cd /Users/cyber_kostyan/git/AI/memo && pnpm add idb --filter @memo/web`

**Step 2: Verify installation**

Run: `cd /Users/cyber_kostyan/git/AI/memo && pnpm ls idb --filter @memo/web`
Expected: `idb` version listed

**Step 3: Commit**

```bash
git add packages/web/package.json pnpm-lock.yaml
git commit -m "chore: add idb dependency for offline IndexedDB support"
```

---

### Task 2: Create OfflineEventStore — IndexedDB schema and basic CRUD

**Files:**
- Create: `packages/web/src/offline/db.ts`
- Create: `packages/web/src/offline/event-store.ts`

**Step 1: Create the IndexedDB database schema**

Create `packages/web/src/offline/db.ts`:

```typescript
import { openDB, type IDBPDatabase } from "idb";

export interface CachedEvent {
  id: string; // server UUID or "temp-<uuid>"
  userId: string;
  category: string;
  details: Record<string, unknown> | null;
  note: string | null;
  rating: number | null;
  ratedAt: string | null;
  timestamp: string;
  createdAt: string;
  updatedAt: string;
  _syncStatus: "synced" | "pending";
}

export interface PendingOp {
  id?: number; // autoIncrement
  type: "create" | "update" | "delete";
  eventId: string;
  data?: Record<string, unknown>;
  createdAt: string;
}

export type MemoOfflineDB = IDBPDatabase<{
  events: {
    key: string;
    value: CachedEvent;
    indexes: {
      "by-user-timestamp": [string, string];
      "by-user-sync": [string, string];
    };
  };
  pendingOps: {
    key: number;
    value: PendingOp;
    indexes: {
      "by-createdAt": string;
      "by-eventId": string;
    };
  };
}>;

let dbPromise: Promise<MemoOfflineDB> | null = null;

export function getDB(): Promise<MemoOfflineDB> {
  if (!dbPromise) {
    dbPromise = openDB("memo-offline", 1, {
      upgrade(db) {
        const eventStore = db.createObjectStore("events", { keyPath: "id" });
        eventStore.createIndex("by-user-timestamp", ["userId", "timestamp"]);
        eventStore.createIndex("by-user-sync", ["userId", "_syncStatus"]);

        const opsStore = db.createObjectStore("pendingOps", {
          keyPath: "id",
          autoIncrement: true,
        });
        opsStore.createIndex("by-createdAt", "createdAt");
        opsStore.createIndex("by-eventId", "eventId");
      },
    }) as Promise<MemoOfflineDB>;
  }
  return dbPromise;
}
```

**Step 2: Create the OfflineEventStore with cache operations**

Create `packages/web/src/offline/event-store.ts`:

```typescript
import { getDB, type CachedEvent, type PendingOp } from "./db";
import type { EventResponse } from "@memo/shared";

function toCache(event: EventResponse, syncStatus: "synced" | "pending", userId: string): CachedEvent {
  return {
    id: event.id,
    userId,
    category: event.category,
    details: event.details,
    note: event.note,
    rating: event.rating,
    ratedAt: event.ratedAt,
    timestamp: event.timestamp,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    _syncStatus: syncStatus,
  };
}

function fromCache(cached: CachedEvent): EventResponse {
  return {
    id: cached.id,
    category: cached.category,
    details: cached.details,
    note: cached.note,
    rating: cached.rating,
    ratedAt: cached.ratedAt,
    timestamp: cached.timestamp,
    createdAt: cached.createdAt,
    updatedAt: cached.updatedAt,
  };
}

/** Cache a list of server events (replaces cache for this user). */
export async function cacheEvents(events: EventResponse[], userId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("events", "readwrite");
  for (const event of events) {
    await tx.store.put(toCache(event, "synced", userId));
  }
  await tx.done;
}

/** Read cached events for a user, sorted by timestamp descending. */
export async function getCachedEvents(userId: string): Promise<EventResponse[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("events", "by-user-timestamp");
  return all
    .filter((e) => e.userId === userId)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .map(fromCache);
}

/** Save a single event to cache. */
export async function cacheEvent(event: EventResponse, userId: string, syncStatus: "synced" | "pending" = "synced"): Promise<void> {
  const db = await getDB();
  await db.put("events", toCache(event, syncStatus, userId));
}

/** Remove a single event from cache. */
export async function removeCachedEvent(eventId: string): Promise<void> {
  const db = await getDB();
  await db.delete("events", eventId);
}

/** Add a pending operation to the queue. */
export async function addPendingOp(op: Omit<PendingOp, "id" | "createdAt">): Promise<void> {
  const db = await getDB();
  await db.add("pendingOps", {
    ...op,
    createdAt: new Date().toISOString(),
  } as PendingOp);
}

/** Get all pending operations in FIFO order. */
export async function getPendingOps(): Promise<PendingOp[]> {
  const db = await getDB();
  return db.getAllFromIndex("pendingOps", "by-createdAt");
}

/** Remove a pending operation by id. */
export async function removePendingOp(id: number): Promise<void> {
  const db = await getDB();
  await db.delete("pendingOps", id);
}

/** Count pending operations for a user. */
export async function getPendingCount(): Promise<number> {
  const db = await getDB();
  const ops = await db.getAll("pendingOps");
  return ops.length;
}

/** Replace a tempId with a real server id across events cache and pending ops. */
export async function replaceTempId(tempId: string, realId: string, serverEvent: EventResponse, userId: string): Promise<void> {
  const db = await getDB();

  // 1. Remove temp entry, add real entry
  const tx1 = db.transaction("events", "readwrite");
  await tx1.store.delete(tempId);
  await tx1.store.put(toCache(serverEvent, "synced", userId));
  await tx1.done;

  // 2. Update pending ops that reference the tempId
  const tx2 = db.transaction("pendingOps", "readwrite");
  const ops = await tx2.store.index("by-eventId").getAll(tempId);
  for (const op of ops) {
    op.eventId = realId;
    await tx2.store.put(op);
  }
  await tx2.done;
}

/** Compact pending ops: merge multiple ops on the same event. */
export async function compactOps(): Promise<PendingOp[]> {
  const ops = await getPendingOps();
  const byEvent = new Map<string, PendingOp[]>();

  for (const op of ops) {
    const existing = byEvent.get(op.eventId) ?? [];
    existing.push(op);
    byEvent.set(op.eventId, existing);
  }

  const compacted: PendingOp[] = [];
  const toRemove: number[] = [];

  for (const [, eventOps] of byEvent) {
    if (eventOps.length === 1) {
      compacted.push(eventOps[0]);
      continue;
    }

    // Determine final operation
    const first = eventOps[0];
    const last = eventOps[eventOps.length - 1];

    if (first.type === "create" && last.type === "delete") {
      // create + ... + delete = nothing
      toRemove.push(...eventOps.map((o) => o.id!));
      continue;
    }

    if (first.type === "create") {
      // create + updates = single create with latest data
      const merged: PendingOp = {
        ...first,
        data: last.data ?? first.data,
      };
      compacted.push(merged);
      toRemove.push(...eventOps.slice(1).map((o) => o.id!));
    } else if (last.type === "delete") {
      // updates + delete = single delete
      compacted.push(last);
      toRemove.push(...eventOps.slice(0, -1).map((o) => o.id!));
    } else {
      // update + update = single update with latest data
      compacted.push(last);
      toRemove.push(...eventOps.slice(0, -1).map((o) => o.id!));
    }
  }

  // Remove compacted-out ops from DB
  if (toRemove.length > 0) {
    const db = await getDB();
    const tx = db.transaction("pendingOps", "readwrite");
    for (const id of toRemove) {
      await tx.store.delete(id);
    }
    await tx.done;
  }

  return compacted;
}

/** Clear all offline data (for logout). */
export async function clearOfflineData(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["events", "pendingOps"], "readwrite");
  await tx.objectStore("events").clear();
  await tx.objectStore("pendingOps").clear();
  await tx.done;
}
```

**Step 3: Commit**

```bash
git add packages/web/src/offline/db.ts packages/web/src/offline/event-store.ts
git commit -m "feat: add IndexedDB schema and OfflineEventStore for offline event caching"
```

---

### Task 3: Create OnlineContext — connectivity detection

**Files:**
- Create: `packages/web/src/contexts/OnlineContext.tsx`

**Step 1: Create the OnlineContext**

Create `packages/web/src/contexts/OnlineContext.tsx`:

```typescript
import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { getPendingCount } from "../offline/event-store";

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
  const onlineListeners = useRef<Array<() => void>>([]);

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

  // Notify sync manager listeners when going online
  useEffect(() => {
    if (isOnline) {
      onlineListeners.current.forEach((fn) => fn());
    }
  }, [isOnline]);

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
```

**Step 2: Wire OnlineProvider into main.tsx**

Modify `packages/web/src/main.tsx` — wrap app with `OnlineProvider` inside `AuthProvider`:

```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { OnlineProvider } from "./contexts/OnlineContext";
import { App } from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <OnlineProvider>
          <App />
        </OnlineProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
```

**Step 3: Commit**

```bash
git add packages/web/src/contexts/OnlineContext.tsx packages/web/src/main.tsx
git commit -m "feat: add OnlineContext for connectivity detection with dual strategy"
```

---

### Task 4: Create SyncManager — replay pending ops on reconnect

**Files:**
- Create: `packages/web/src/offline/sync-manager.ts`

**Step 1: Create the SyncManager**

Create `packages/web/src/offline/sync-manager.ts`:

```typescript
import { api, ApiError } from "../api/client";
import {
  compactOps,
  removePendingOp,
  replaceTempId,
  removeCachedEvent,
  cacheEvent,
} from "./event-store";
import type { PendingOp } from "./db";
import type { EventResponse } from "@memo/shared";
import { toast } from "sonner";

export interface SyncCallbacks {
  userId: string;
  onSyncStart: () => void;
  onSyncEnd: () => void;
  onPendingCountChange: () => Promise<void>;
  onEventsChanged: () => void;
}

export async function syncPendingOps(callbacks: SyncCallbacks): Promise<void> {
  const ops = await compactOps();
  if (ops.length === 0) return;

  callbacks.onSyncStart();

  try {
    for (const op of ops) {
      try {
        await syncSingleOp(op, callbacks.userId);
        await removePendingOp(op.id!);
        await callbacks.onPendingCountChange();
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 401) {
            // Auth issue — stop sync, user needs to re-login
            toast.error("Session expired. Please log in again.");
            break;
          }
          if (err.status >= 400 && err.status < 500) {
            // Client error — remove from queue (data is invalid)
            toast.error(`Sync failed for an event: ${err.message}`);
            await removePendingOp(op.id!);
            await callbacks.onPendingCountChange();
            continue;
          }
          // 5xx — keep in queue, stop sync
          break;
        }
        // Network error — stop sync, wait for next online
        break;
      }
    }
  } finally {
    callbacks.onSyncEnd();
    callbacks.onEventsChanged();
  }
}

async function syncSingleOp(op: PendingOp, userId: string): Promise<void> {
  switch (op.type) {
    case "create": {
      const serverEvent = await api<EventResponse>("/events", {
        method: "POST",
        body: JSON.stringify(op.data),
      });
      await replaceTempId(op.eventId, serverEvent.id, serverEvent, userId);
      break;
    }
    case "update": {
      const updated = await api<EventResponse>(`/events/${op.eventId}`, {
        method: "PATCH",
        body: JSON.stringify(op.data),
      });
      await cacheEvent(updated, userId);
      break;
    }
    case "delete": {
      await api(`/events/${op.eventId}`, { method: "DELETE" });
      await removeCachedEvent(op.eventId);
      break;
    }
  }
}
```

**Step 2: Commit**

```bash
git add packages/web/src/offline/sync-manager.ts
git commit -m "feat: add SyncManager for replaying pending offline operations"
```

---

### Task 5: Create OfflineBanner UI component

**Files:**
- Create: `packages/web/src/components/OfflineBanner.tsx`

**Step 1: Create the OfflineBanner**

Create `packages/web/src/components/OfflineBanner.tsx`:

```typescript
import { AnimatePresence, motion } from "motion/react";
import { WifiOff, RefreshCw, Check } from "lucide-react";
import { useOnline } from "../contexts/OnlineContext";

export function OfflineBanner() {
  const { isOnline, pendingCount, isSyncing } = useOnline();

  // Show banner when offline or actively syncing
  const showBanner = !isOnline || isSyncing;

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="overflow-hidden"
        >
          <div
            className={`flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium ${
              isSyncing
                ? "bg-indigo-500/20 text-indigo-300"
                : "bg-amber-500/20 text-amber-300"
            }`}
          >
            {isSyncing ? (
              <>
                <RefreshCw size={14} className="animate-spin" />
                <span>Syncing...</span>
              </>
            ) : (
              <>
                <WifiOff size={14} />
                <span>
                  Offline{pendingCount > 0 && ` — ${pendingCount} change${pendingCount > 1 ? "s" : ""} pending sync`}
                </span>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

**Step 2: Add OfflineBanner to AppLayout**

Modify `packages/web/src/components/layout/AppLayout.tsx`:

```typescript
import { useState, type ReactNode } from "react";
import { AppHeader } from "./AppHeader";
import { Sidebar } from "./Sidebar";
import { AiFab } from "./AiFab";
import { OfflineBanner } from "../OfflineBanner";

export function AppLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />
      <main className="flex-1 pt-14">
        <OfflineBanner />
        {children}
      </main>
      <AiFab />
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add packages/web/src/components/OfflineBanner.tsx packages/web/src/components/layout/AppLayout.tsx
git commit -m "feat: add OfflineBanner component with connectivity status display"
```

---

### Task 6: Modify api/client.ts — add fetch error reporting

**Files:**
- Modify: `packages/web/src/api/client.ts`

**Step 1: Add online status reporting hooks**

The `api()` function needs to report fetch success/failure to `OnlineContext`. Since `api/client.ts` is outside React, use a callback pattern:

Add to `packages/web/src/api/client.ts` at the top (after existing variables):

```typescript
// Online status callbacks — set by OnlineContext
let onFetchSuccess: (() => void) | null = null;
let onFetchError: (() => void) | null = null;

export function setOnlineCallbacks(
  success: () => void,
  error: () => void,
) {
  onFetchSuccess = success;
  onFetchError = error;
}
```

Then modify the `api()` function to report results. Wrap the first `fetch` call in try/catch to detect network errors:

Replace the `api` function body with:

```typescript
export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    onFetchSuccess?.();
  } catch (err) {
    onFetchError?.();
    throw err;
  }

  // Auto-refresh on 401
  if (res.status === 401 && refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${accessToken}`;
      try {
        res = await fetch(`${API_BASE}${path}`, { ...options, headers });
        onFetchSuccess?.();
      } catch (err) {
        onFetchError?.();
        throw err;
      }
    }
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, error.message || res.statusText, error.errors);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}
```

**Step 2: Wire callbacks in OnlineContext**

Modify `packages/web/src/contexts/OnlineContext.tsx` — add in the `OnlineProvider` component body, inside a `useEffect`:

```typescript
import { setOnlineCallbacks } from "../api/client";

// Inside OnlineProvider, add this useEffect:
useEffect(() => {
  setOnlineCallbacks(reportFetchSuccess, reportFetchError);
}, [reportFetchSuccess, reportFetchError]);
```

**Step 3: Commit**

```bash
git add packages/web/src/api/client.ts packages/web/src/contexts/OnlineContext.tsx
git commit -m "feat: add fetch error/success reporting to api client for offline detection"
```

---

### Task 7: Modify useEvents — integrate offline store

This is the core integration task. The `useEvents` hook must route through the offline store.

**Files:**
- Modify: `packages/web/src/hooks/useEvents.ts`

**Step 1: Rewrite useEvents with offline support**

Replace the entire `packages/web/src/hooks/useEvents.ts` with:

```typescript
import { useState, useCallback, useRef } from "react";
import { api } from "../api/client";
import { useOnline } from "../contexts/OnlineContext";
import { useAuth } from "../auth/AuthContext";
import {
  cacheEvents,
  cacheEvent,
  getCachedEvents,
  removeCachedEvent,
  addPendingOp,
} from "../offline/event-store";
import type {
  EventResponse,
  PaginatedResponse,
  CreateEventDto,
  UpdateEventDto,
  EventCategory,
} from "@memo/shared";

const PAGE_SIZE = 30;

export function useEvents() {
  const [events, setEvents] = useState<EventResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const { isOnline, refreshPendingCount } = useOnline();
  const { user } = useAuth();

  const eventsRef = useRef(events);
  eventsRef.current = events;

  const loadingMoreRef = useRef(false);
  const isOnlineRef = useRef(isOnline);
  isOnlineRef.current = isOnline;

  const userId = user?.id ?? "";

  const fetchEvents = useCallback(
    async (params?: {
      from?: string;
      to?: string;
      category?: EventCategory;
      limit?: number;
      offset?: number;
    }) => {
      setLoading(true);
      try {
        if (isOnlineRef.current) {
          const query = new URLSearchParams();
          if (params?.from) query.set("from", params.from);
          if (params?.to) query.set("to", params.to);
          if (params?.category) query.set("category", params.category);
          query.set("limit", String(params?.limit ?? PAGE_SIZE));
          if (params?.offset) query.set("offset", String(params.offset));

          const qs = query.toString();
          const res = await api<PaginatedResponse<EventResponse>>(
            `/events${qs ? `?${qs}` : ""}`,
          );
          setEvents(res.data);
          setTotal(res.total);

          // Cache fetched events
          if (userId) {
            await cacheEvents(res.data, userId);
          }
          return res;
        } else {
          // Offline: read from IndexedDB
          const cached = await getCachedEvents(userId);
          setEvents(cached);
          setTotal(cached.length);
          return { data: cached, total: cached.length };
        }
      } catch {
        // Fetch failed — try cache
        const cached = await getCachedEvents(userId);
        setEvents(cached);
        setTotal(cached.length);
        return { data: cached, total: cached.length };
      } finally {
        setLoading(false);
      }
    },
    [userId],
  );

  const loadMore = useCallback(
    async (params?: {
      from?: string;
      to?: string;
      category?: EventCategory;
    }) => {
      if (loadingMoreRef.current) return;
      if (!isOnlineRef.current) return; // No pagination offline — all cached events already loaded
      loadingMoreRef.current = true;
      setLoadingMore(true);
      try {
        const query = new URLSearchParams();
        if (params?.from) query.set("from", params.from);
        if (params?.to) query.set("to", params.to);
        if (params?.category) query.set("category", params.category);
        query.set("limit", String(PAGE_SIZE));
        query.set("offset", String(eventsRef.current.length));

        const qs = query.toString();
        const res = await api<PaginatedResponse<EventResponse>>(
          `/events${qs ? `?${qs}` : ""}`,
        );

        setEvents((prev) => {
          const existingIds = new Set(prev.map((e) => e.id));
          const newItems = res.data.filter((e) => !existingIds.has(e.id));
          return [...prev, ...newItems];
        });
        setTotal(res.total);

        // Cache newly loaded events
        if (userId) {
          await cacheEvents(res.data, userId);
        }
      } finally {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    },
    [userId],
  );

  const hasMore = events.length < total;

  const createEvent = useCallback(
    async (dto: CreateEventDto) => {
      if (isOnlineRef.current) {
        try {
          const event = await api<EventResponse>("/events", {
            method: "POST",
            body: JSON.stringify(dto),
          });
          setEvents((prev) => [event, ...prev]);
          setTotal((prev) => prev + 1);

          // Cache synced event
          if (userId) {
            await cacheEvent(event, userId);
          }
          return event;
        } catch (err) {
          // If fetch error (network), fall through to offline path
          if (err instanceof TypeError) {
            // Network error — save offline
          } else {
            throw err; // Re-throw API errors
          }
        }
      }

      // Offline: create with temp ID
      const tempId = `temp-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const offlineEvent: EventResponse = {
        id: tempId,
        category: dto.category,
        details: (dto.details as Record<string, unknown>) ?? null,
        note: dto.note ?? null,
        rating: null,
        ratedAt: null,
        timestamp: dto.timestamp ?? now,
        createdAt: now,
        updatedAt: now,
      };

      setEvents((prev) => [offlineEvent, ...prev]);
      setTotal((prev) => prev + 1);

      if (userId) {
        await cacheEvent(offlineEvent, userId, "pending");
        await addPendingOp({
          type: "create",
          eventId: tempId,
          data: dto as unknown as Record<string, unknown>,
        });
        await refreshPendingCount();
      }

      return offlineEvent;
    },
    [userId, refreshPendingCount],
  );

  const updateEvent = useCallback(
    async (id: string, dto: UpdateEventDto) => {
      if (isOnlineRef.current) {
        try {
          const event = await api<EventResponse>(`/events/${id}`, {
            method: "PATCH",
            body: JSON.stringify(dto),
          });
          setEvents((prev) => prev.map((e) => (e.id === id ? event : e)));

          if (userId) {
            await cacheEvent(event, userId);
          }
          return event;
        } catch (err) {
          if (err instanceof TypeError) {
            // Network error — fall through to offline path
          } else {
            throw err;
          }
        }
      }

      // Offline: update locally
      const now = new Date().toISOString();
      let updatedEvent: EventResponse | undefined;

      setEvents((prev) =>
        prev.map((e) => {
          if (e.id !== id) return e;
          updatedEvent = {
            ...e,
            details: (dto.details as Record<string, unknown>) ?? e.details,
            note: dto.note !== undefined ? dto.note ?? null : e.note,
            timestamp: dto.timestamp ?? e.timestamp,
            updatedAt: now,
          };
          return updatedEvent;
        }),
      );

      if (userId && updatedEvent) {
        await cacheEvent(updatedEvent, userId, "pending");
        await addPendingOp({
          type: "update",
          eventId: id,
          data: dto as unknown as Record<string, unknown>,
        });
        await refreshPendingCount();
      }

      return updatedEvent!;
    },
    [userId, refreshPendingCount],
  );

  const deleteEvent = useCallback(
    async (id: string) => {
      if (isOnlineRef.current) {
        try {
          await api(`/events/${id}`, { method: "DELETE" });
          setEvents((prev) => prev.filter((e) => e.id !== id));
          setTotal((prev) => prev - 1);

          if (userId) {
            await removeCachedEvent(id);
          }
          return;
        } catch (err) {
          if (err instanceof TypeError) {
            // Network error — fall through to offline
          } else {
            throw err;
          }
        }
      }

      // Offline: remove locally
      setEvents((prev) => prev.filter((e) => e.id !== id));
      setTotal((prev) => prev - 1);

      if (userId) {
        await removeCachedEvent(id);
        await addPendingOp({ type: "delete", eventId: id });
        await refreshPendingCount();
      }
    },
    [userId, refreshPendingCount],
  );

  return {
    events,
    total,
    loading,
    loadingMore,
    hasMore,
    fetchEvents,
    loadMore,
    createEvent,
    updateEvent,
    deleteEvent,
  };
}
```

**Step 2: Verify the app compiles**

Run: `cd /Users/cyber_kostyan/git/AI/memo && pnpm --filter @memo/web build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add packages/web/src/hooks/useEvents.ts
git commit -m "feat: integrate offline store into useEvents hook for full CRUD offline support"
```

---

### Task 8: Wire SyncManager into OnlineContext — auto-sync on reconnect

**Files:**
- Modify: `packages/web/src/contexts/OnlineContext.tsx`

**Step 1: Add sync trigger on online event**

In `OnlineContext.tsx`, import and call `syncPendingOps` when transitioning to online:

Add import at top:
```typescript
import { syncPendingOps } from "../offline/sync-manager";
import { useAuth } from "../auth/AuthContext";
```

Inside `OnlineProvider`, add `useAuth` and a sync trigger effect:

```typescript
const { user } = useAuth();

// Trigger sync when going online
const prevOnline = useRef(isOnline);
useEffect(() => {
  if (isOnline && !prevOnline.current && user?.id) {
    // Just came online — sync
    syncPendingOps({
      userId: user.id,
      onSyncStart: () => setIsSyncing(true),
      onSyncEnd: () => {
        setIsSyncing(false);
        setLastSyncAt(new Date());
      },
      onPendingCountChange: refreshPendingCount,
      onEventsChanged: () => {
        // Components will re-fetch on their own via their effects
      },
    });
  }
  prevOnline.current = isOnline;
}, [isOnline, user?.id, refreshPendingCount]);
```

**Step 2: Verify the app compiles**

Run: `cd /Users/cyber_kostyan/git/AI/memo && pnpm --filter @memo/web build`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add packages/web/src/contexts/OnlineContext.tsx
git commit -m "feat: wire SyncManager into OnlineContext for auto-sync on reconnect"
```

---

### Task 9: Add offline guard for non-offline features

**Files:**
- Modify: `packages/web/src/pages/AnalysisPage.tsx`
- Modify: `packages/web/src/pages/RemindersPage.tsx`

**Step 1: Add offline toast to AnalysisPage**

In `AnalysisPage.tsx`, add at the top of the component function:

```typescript
import { useOnline } from "../contexts/OnlineContext";
import { toast } from "sonner";

// Inside the component:
const { isOnline } = useOnline();
```

And before any API call that requires network, check:
```typescript
if (!isOnline) {
  toast.error("This feature requires an internet connection");
  return;
}
```

**Step 2: Add offline toast to RemindersPage**

Same pattern in `RemindersPage.tsx`.

**Step 3: Commit**

```bash
git add packages/web/src/pages/AnalysisPage.tsx packages/web/src/pages/RemindersPage.tsx
git commit -m "feat: add offline guard toasts for features requiring network"
```

---

### Task 10: Clear offline data on logout

**Files:**
- Modify: `packages/web/src/auth/AuthContext.tsx`

**Step 1: Call clearOfflineData on logout**

Import and call `clearOfflineData` in the `logout` function:

```typescript
import { clearOfflineData } from "../offline/event-store";

// In the logout function, after clearTokens():
const logout = () => {
  const rt = localStorage.getItem("refreshToken");
  if (rt) {
    api("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refreshToken: rt }),
    }).catch(() => {});
  }
  clearTokens();
  clearOfflineData();
  setUser(null);
};
```

**Step 2: Commit**

```bash
git add packages/web/src/auth/AuthContext.tsx
git commit -m "feat: clear offline IndexedDB data on user logout"
```

---

### Task 11: Update EventDetailSheet — use useEvents instead of direct api calls

**Files:**
- Modify: `packages/web/src/components/events/EventDetailSheet.tsx`

**Step 1: Refactor EventDetailSheet to route through props callbacks**

Currently `EventDetailSheet` calls `api()` directly. It should instead accept `onSaved` callback which the parent page already provides. The parent already calls `useEvents().createEvent()` / `useEvents().updateEvent()` via the callback pattern.

Looking at the current code: `EventDetailSheet` calls `api()` directly in its submit handler (lines 138-185). The `onSaved` callback is called _after_ the API response.

The fix: The parent page should pass the create/update functions. The simplest approach — modify `EventDetailSheet` to accept a `saveEvent` prop that handles the API call:

Modify the `Props` interface:
```typescript
interface Props {
  category: EventCategory;
  event?: EventResponse;
  onClose: () => void;
  onSaved?: (event: EventResponse) => void;
  createEvent?: (dto: CreateEventDto) => Promise<EventResponse>;
  updateEvent?: (id: string, dto: UpdateEventDto) => Promise<EventResponse>;
}
```

Modify the `handleSubmit` to use the passed functions when available, falling back to direct `api()`:

```typescript
const handleSubmit = async (e: FormEvent) => {
  e.preventDefault();
  setSaving(true);
  try {
    const cleanDetails: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(details)) {
      if (v !== "") {
        const num = Number(v);
        cleanDetails[k] = isNaN(num) ? v : num;
      }
    }

    const ts = new Date(timestamp).toISOString();

    let saved: EventResponse;
    if (event) {
      const dto: UpdateEventDto = {
        details: Object.keys(cleanDetails).length > 0 ? cleanDetails : undefined,
        note: note || undefined,
        timestamp: ts,
      };
      saved = updateEvent
        ? await updateEvent(event.id, dto)
        : await api<EventResponse>(`/events/${event.id}`, {
            method: "PATCH",
            body: JSON.stringify(dto),
          });
    } else {
      const dto: CreateEventDto = {
        category,
        details: Object.keys(cleanDetails).length > 0 ? cleanDetails : undefined,
        note: note || undefined,
        timestamp: ts,
      };
      saved = createEvent
        ? await createEvent(dto)
        : await api<EventResponse>("/events", {
            method: "POST",
            body: JSON.stringify(dto),
          });
    }
    onSaved?.(saved);
    onClose();
    toast.success(event ? "Updated" : "Saved");
  } catch {
    toast.error("Failed to save");
  } finally {
    setSaving(false);
  }
};
```

Then update parent components (`HomePage.tsx`, `QuickEntryGrid.tsx`) to pass `createEvent`/`updateEvent` from `useEvents()`.

**Step 2: Update QuickEntryGrid to accept and pass through the functions**

Check `QuickEntryGrid.tsx` — it renders `EventDetailSheet`. Modify its props to accept and forward `createEvent`/`updateEvent`.

**Step 3: Update HomePage to pass useEvents functions to the sheet**

In `HomePage.tsx`, pass `createEvent` and `updateEvent` from `useEvents()` to `EventDetailSheet`.

**Step 4: Verify the app compiles**

Run: `cd /Users/cyber_kostyan/git/AI/memo && pnpm --filter @memo/web build`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add packages/web/src/components/events/EventDetailSheet.tsx packages/web/src/components/events/QuickEntryGrid.tsx packages/web/src/pages/HomePage.tsx
git commit -m "refactor: route EventDetailSheet through useEvents for offline support"
```

---

### Task 12: Manual testing & verification

**Step 1: Start the dev server**

Run: `cd /Users/cyber_kostyan/git/AI/memo && pnpm dev`

**Step 2: Test online flow**

1. Open app in browser
2. Create an event → should work as before
3. Edit an event → should work as before
4. Delete an event → should work as before

**Step 3: Test offline flow**

1. Open DevTools → Network → check "Offline"
2. Verify banner appears: "Offline"
3. Create an event → should appear immediately in the list
4. Edit the event → should update in place
5. Delete the event → should remove from list
6. Uncheck "Offline"
7. Verify: banner shows "Syncing..." briefly, then disappears
8. Refresh the page → verify events were synced to server

**Step 4: Test page refresh offline**

1. Create a few events while online (to populate cache)
2. Go offline in DevTools
3. Refresh the page → events should load from IndexedDB cache
4. Create a new offline event
5. Go online → verify sync

**Step 5: Final commit**

If any issues found, fix them and commit:
```bash
git add -A
git commit -m "fix: address issues found during offline mode manual testing"
```
