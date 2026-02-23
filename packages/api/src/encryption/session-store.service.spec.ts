import { SessionStoreService } from "./session-store.service";

/** Helper: compare two Uint8Arrays */
const arraysEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

describe("SessionStoreService", () => {
  let store: SessionStoreService;

  beforeEach(() => {
    store = new SessionStoreService();
  });

  it("stores and retrieves a DEK by userId", () => {
    const dek = new Uint8Array(32).fill(0xaa);
    store.set("user-1", dek);
    expect(arraysEqual(store.get("user-1")!, dek)).toBe(true);
  });

  it("returns null for unknown userId", () => {
    expect(store.get("unknown")).toBeNull();
  });

  it("deletes a stored DEK", () => {
    store.set("user-1", new Uint8Array(32));
    store.delete("user-1");
    expect(store.get("user-1")).toBeNull();
  });

  it("delete for unknown userId does not throw", () => {
    expect(() => store.delete("unknown")).not.toThrow();
  });

  it("overwrites DEK on repeated set", () => {
    const dek1 = new Uint8Array(32).fill(0x01);
    const dek2 = new Uint8Array(32).fill(0x02);
    store.set("user-1", dek1);
    store.set("user-1", dek2);
    expect(arraysEqual(store.get("user-1")!, dek2)).toBe(true);
  });
});
