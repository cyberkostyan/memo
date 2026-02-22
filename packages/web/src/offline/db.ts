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
