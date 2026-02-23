import { SessionStoreService } from "./session-store.service";

describe("SessionStoreService", () => {
  let store: SessionStoreService;

  beforeEach(() => {
    store = new SessionStoreService();
  });

  it("stores and retrieves a DEK by userId", () => {
    const dek = Buffer.alloc(32, 0xaa);
    store.set("user-1", dek);
    expect(store.get("user-1")?.equals(dek)).toBe(true);
  });

  it("returns null for unknown userId", () => {
    expect(store.get("unknown")).toBeNull();
  });

  it("deletes a stored DEK", () => {
    store.set("user-1", Buffer.alloc(32));
    store.delete("user-1");
    expect(store.get("user-1")).toBeNull();
  });

  it("delete for unknown userId does not throw", () => {
    expect(() => store.delete("unknown")).not.toThrow();
  });

  it("overwrites DEK on repeated set", () => {
    const dek1 = Buffer.alloc(32, 0x01);
    const dek2 = Buffer.alloc(32, 0x02);
    store.set("user-1", dek1);
    store.set("user-1", dek2);
    expect(store.get("user-1")?.equals(dek2)).toBe(true);
  });
});
