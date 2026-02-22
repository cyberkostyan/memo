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

let syncing = false;

export async function syncPendingOps(callbacks: SyncCallbacks): Promise<void> {
  if (syncing) return;
  syncing = true;

  const ops = await compactOps();
  if (ops.length === 0) {
    syncing = false;
    return;
  }

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
            toast.error("Session expired. Please log in again.");
            break;
          }
          if (err.status >= 400 && err.status < 500) {
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
    syncing = false;
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
