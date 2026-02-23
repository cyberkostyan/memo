import { Injectable } from "@nestjs/common";

interface SessionEntry {
  dek: Buffer;
  lastAccess: Date;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class SessionStoreService {
  private store = new Map<string, SessionEntry>();
  private cleanupTimer?: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  set(userId: string, dek: Buffer): void {
    this.store.set(userId, { dek, lastAccess: new Date() });
  }

  get(userId: string): Buffer | null {
    const entry = this.store.get(userId);
    if (!entry) return null;
    if (Date.now() - entry.lastAccess.getTime() > TTL_MS) {
      this.store.delete(userId);
      return null;
    }
    entry.lastAccess = new Date();
    return entry.dek;
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
