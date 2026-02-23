import { Injectable } from "@nestjs/common";

interface SessionEntry {
  dek: Uint8Array;
  lastAccess: Date;
}

const TTL_MS = 8 * 60 * 60 * 1000; // 8 hours
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class SessionStoreService {
  private store = new Map<string, SessionEntry>();
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  set(userId: string, dek: Uint8Array): void {
    this.store.set(userId, { dek, lastAccess: new Date() });
  }

  get(userId: string): Uint8Array | null {
    const entry = this.store.get(userId);
    if (!entry) return null;
    if (Date.now() - entry.lastAccess.getTime() > TTL_MS) {
      this.store.delete(userId);
      return null;
    }
    entry.lastAccess = new Date();
    return entry.dek;
  }

  getExpiresIn(userId: string): number | null {
    const entry = this.store.get(userId);
    if (!entry) return null;
    const remaining = TTL_MS - (Date.now() - entry.lastAccess.getTime());
    if (remaining <= 0) {
      this.store.delete(userId);
      return null;
    }
    return Math.round(remaining / 1000);
  }

  delete(userId: string): void {
    this.store.delete(userId);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [userId, entry] of this.store) {
      if (now - entry.lastAccess.getTime() > TTL_MS) {
        this.store.delete(userId);
      }
    }
  }
}
