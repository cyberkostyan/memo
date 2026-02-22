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
