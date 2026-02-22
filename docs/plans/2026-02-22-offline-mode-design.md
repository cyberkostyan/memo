# Offline Mode Design

## Date: 2026-02-22

## Summary

Enable full CRUD operations (create, read, update, delete events) when the app is offline or the backend is unreachable. Changes are queued locally in IndexedDB and synchronized with the server when connectivity is restored.

## Requirements

| Aspect | Decision |
|--------|----------|
| Scope | Full CRUD offline |
| Conflict resolution | Last-write-wins (by updatedAt) |
| UI indicator | Top banner with pending operation count |
| Asset caching | No — offline queue only (app must be already loaded) |
| Offline detection | navigator.onLine + fetch error detection |
| Sync strategy | Simple: online event → flush queue sequentially |
| Retry | No exponential backoff — sync on online, stop on offline |

## Approach: IndexedDB + Custom Sync Queue

Chosen over Dexie.js (overkill, 28KB) and Workbox Background Sync (no Safari/iOS support, doesn't solve CRUD offline).

**Dependencies:** `idb` (~1.5KB gzipped) — thin typed wrapper around IndexedDB.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  React App                       │
│                                                  │
│  ┌──────────────┐    ┌───────────────────────┐  │
│  │ useOnline()  │───>│  OnlineContext         │  │
│  │ hook         │    │  (navigator.onLine +   │  │
│  └──────────────┘    │   fetch error detect)  │  │
│                      └───────────────────────┘  │
│                              │                   │
│  ┌──────────────────────────┐│                   │
│  │     OfflineBanner        ││                   │
│  │  "Offline — N pending"   │◄┘                  │
│  └──────────────────────────┘                    │
│                                                  │
│  ┌──────────────┐    ┌───────────────────────┐  │
│  │ useEvents()  │───>│  OfflineEventStore     │  │
│  │ (modified)   │    │  (IndexedDB)           │  │
│  └──────────────┘    │                        │  │
│         │            │  - events cache        │  │
│         │            │  - pending operations  │  │
│         ▼            └───────────┬────────────┘  │
│  ┌──────────────┐               │                │
│  │  api/client  │◄──────────────┘                │
│  │  (modified)  │    ┌───────────────────────┐  │
│  │              │───>│  SyncManager           │  │
│  └──────────────┘    │  - flush queue on      │  │
│                      │    online event        │  │
│                      │  - sequential replay   │  │
│                      └───────────────────────┘  │
└─────────────────────────────────────────────────┘
```

### Modules

| Module | File | Responsibility |
|--------|------|----------------|
| **OfflineEventStore** | `src/offline/event-store.ts` | IndexedDB wrapper: events cache + pending ops queue |
| **SyncManager** | `src/offline/sync-manager.ts` | On reconnect — replay queue to server |
| **OnlineContext** | `src/contexts/OnlineContext.tsx` | React context: `isOnline`, `pendingCount`, `isSyncing` |
| **OfflineBanner** | `src/components/OfflineBanner.tsx` | UI banner |
| **api/client.ts** | Modification | On offline — save to queue instead of fetch |
| **useEvents** | Modification | Read from IndexedDB, write to queue |

## IndexedDB Schema

**Database:** `memo-offline`, **Version:** 1

### Object Store: `events`

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (key) | UUID from server or `temp-<uuid>` for offline |
| `userId` | string (indexed) | For multi-user support |
| `category` | string | meal, mood, etc. |
| `details` | JSON | Category-specific data |
| `note` | string? | Free text note |
| `timestamp` | Date (indexed) | Event time |
| `createdAt` | Date | |
| `updatedAt` | Date | For last-write-wins |
| `_syncStatus` | string | `"synced"` or `"pending"` |

### Object Store: `pendingOps`

| Field | Type | Description |
|-------|------|-------------|
| `id` | number (autoIncrement, key) | Sequential order |
| `type` | string | `"create"` / `"update"` / `"delete"` |
| `eventId` | string | Event ID (may be temp-*) |
| `data` | JSON? | Payload for create/update |
| `createdAt` | Date | When operation was created |

### Indexes

- `events`: `[userId, timestamp]` — journal sort
- `events`: `[userId, _syncStatus]` — pending count
- `pendingOps`: `createdAt` — FIFO order

### Operation Compaction

Multiple ops on same event are compacted before sync:

- `create` + `update` → single `create` with final data
- `create` + `delete` → remove both (nothing to sync)
- `update` + `update` → single `update` with final data
- `update` + `delete` → single `delete`

## Data Flow

### Creating an Event

**Online:**
1. User creates event
2. `useEvents.createEvent()` → `api("/events", POST)` → server
3. Response saved to IndexedDB cache + React state

**Offline:**
1. User creates event
2. `useEvents.createEvent()` detects offline
3. Generates `temp-<uuid>`, saves to IndexedDB cache with `_syncStatus: "pending"`
4. Adds `{type: "create", data, eventId: "temp-xxx"}` to pendingOps
5. Event displayed in journal immediately
6. On reconnect → SyncManager → POST → replaces tempId with real id

### Sync Flow

```
Online event detected
       │
       ▼
  pendingOps.count > 0?
       │
  ┌────┴─────┐
  No         Yes
  Done        │
              ▼
        Compact ops
              │
              ▼
        For each op (FIFO):
          create  → POST /events     → replace tempId
          update  → PATCH /events/:id
          delete  → DELETE /events/:id
              │
         ┌────┴──────┐
         Success     Network error → stop, wait for next online
              │
         Remove op, mark "synced"
              │
         Next op...
              │
         All done → refresh from server
```

## Error Handling

| Error | Action |
|-------|--------|
| Network error | Stop sync, wait for next online event |
| 4xx validation | Mark op as failed, show toast, remove from queue |
| 401 Unauthorized | Try token refresh; if fails — stop sync, show "Login required" |
| 5xx server error | Keep in queue, stop sync — retry on next online |
| 409 Conflict | Last-write-wins: overwrite server data |

### tempId → realId Replacement

When syncing a create operation, the server returns the real `id`. Steps:
1. Update `events` store: replace `temp-xxx` entry with real `id`
2. Update remaining pendingOps referencing `temp-xxx` → real `id`
3. Update React state (via callback or re-fetch)

## UI

### OfflineBanner

Compact banner at top of screen (below navigation):

- Yellow background, noticeable but not aggressive
- Shows pending operation count: "Offline — 3 changes pending sync"
- Animated show/hide (Motion library)
- On reconnect: briefly shows "Syncing..." → "Synced!" → disappears

### OnlineContext API

```typescript
interface OnlineContextValue {
  isOnline: boolean;
  pendingCount: number;
  isSyncing: boolean;
  lastSyncAt: Date | null;
}
```

### What Does NOT Work Offline

- AI Analysis — requires OpenAI API
- Reminders — server-side logic
- Registration/Login — requires server

For these actions offline, show toast: "This feature requires an internet connection".

## Modified Hooks

### useEvents modifications

- `fetchEvents()`: online → fetch + cache in IDB; offline → read from IDB
- `createEvent(dto)`: online → POST + cache; offline → IDB + pendingOps
- `updateEvent(id, dto)`: online → PATCH + update IDB; offline → update IDB + pendingOps
- `deleteEvent(id)`: online → DELETE + remove IDB; offline → mark deleted + pendingOps

## Online Detection

Dual detection strategy:

1. **navigator.onLine** + `online`/`offline` events — fast detection
2. **Fetch error detection** — catches "WiFi connected but no internet" scenario
   - On any fetch network error → set offline
   - On successful fetch → set online
