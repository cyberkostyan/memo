# E2E Encryption Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Encrypt all sensitive user health data (event details, notes, attachments, analysis results) using AES-256-GCM with envelope encryption derived from the user's password.

**Architecture:** Envelope encryption with PBKDF2-derived KEK wrapping a random DEK. DEK lives in server memory (session store) only during active sessions. All crypto via `node:crypto` (no external deps). Single migration script for existing data.

**Tech Stack:** Node.js `node:crypto`, NestJS, Prisma, PostgreSQL, Jest

**Design doc:** `docs/plans/2026-02-23-e2e-encryption-design.md`

---

### Task 1: EncryptionService — core cryptography

**Files:**
- Create: `packages/api/src/encryption/encryption.service.ts`
- Test: `packages/api/src/encryption/encryption.service.spec.ts`

**Step 1: Write the failing tests**

```typescript
// packages/api/src/encryption/encryption.service.spec.ts
import { EncryptionService } from "./encryption.service";

describe("EncryptionService", () => {
  let service: EncryptionService;

  beforeEach(() => {
    service = new EncryptionService();
  });

  describe("deriveKEK", () => {
    it("derives a 32-byte key from password and salt", () => {
      const salt = Buffer.alloc(32, 1);
      const kek = service.deriveKEK("password123", salt);
      expect(kek).toBeInstanceOf(Buffer);
      expect(kek.length).toBe(32);
    });

    it("produces different keys for different passwords", () => {
      const salt = Buffer.alloc(32, 1);
      const kek1 = service.deriveKEK("password1", salt);
      const kek2 = service.deriveKEK("password2", salt);
      expect(kek1.equals(kek2)).toBe(false);
    });

    it("produces different keys for different salts", () => {
      const salt1 = Buffer.alloc(32, 1);
      const salt2 = Buffer.alloc(32, 2);
      const kek1 = service.deriveKEK("password", salt1);
      const kek2 = service.deriveKEK("password", salt2);
      expect(kek1.equals(kek2)).toBe(false);
    });
  });

  describe("generateDEK", () => {
    it("generates a 32-byte random key", () => {
      const dek = service.generateDEK();
      expect(dek).toBeInstanceOf(Buffer);
      expect(dek.length).toBe(32);
    });

    it("generates unique keys each call", () => {
      const dek1 = service.generateDEK();
      const dek2 = service.generateDEK();
      expect(dek1.equals(dek2)).toBe(false);
    });
  });

  describe("generateSalt", () => {
    it("generates a 32-byte random salt", () => {
      const salt = service.generateSalt();
      expect(salt).toBeInstanceOf(Buffer);
      expect(salt.length).toBe(32);
    });
  });

  describe("wrapDEK / unwrapDEK", () => {
    it("round-trips: wrap then unwrap returns original DEK", () => {
      const dek = service.generateDEK();
      const kek = service.deriveKEK("password", Buffer.alloc(32, 1));
      const { encrypted, nonce } = service.wrapDEK(kek, dek);
      const unwrapped = service.unwrapDEK(kek, encrypted, nonce);
      expect(unwrapped.equals(dek)).toBe(true);
    });

    it("unwrap fails with wrong KEK", () => {
      const dek = service.generateDEK();
      const salt = Buffer.alloc(32, 1);
      const kek = service.deriveKEK("correct", salt);
      const wrongKek = service.deriveKEK("wrong", salt);
      const { encrypted, nonce } = service.wrapDEK(kek, dek);
      expect(() => service.unwrapDEK(wrongKek, encrypted, nonce)).toThrow();
    });
  });

  describe("encrypt / decrypt", () => {
    it("round-trips plaintext data", () => {
      const dek = service.generateDEK();
      const plaintext = Buffer.from("Hello, World!");
      const blob = service.encrypt(dek, plaintext);
      const decrypted = service.decrypt(dek, blob);
      expect(decrypted.equals(plaintext)).toBe(true);
    });

    it("produces different ciphertext each time (unique nonce)", () => {
      const dek = service.generateDEK();
      const plaintext = Buffer.from("same data");
      const blob1 = service.encrypt(dek, plaintext);
      const blob2 = service.encrypt(dek, plaintext);
      expect(blob1.equals(blob2)).toBe(false);
    });

    it("decrypt fails with wrong DEK", () => {
      const dek1 = service.generateDEK();
      const dek2 = service.generateDEK();
      const blob = service.encrypt(dek1, Buffer.from("secret"));
      expect(() => service.decrypt(dek2, blob)).toThrow();
    });

    it("handles empty data", () => {
      const dek = service.generateDEK();
      const blob = service.encrypt(dek, Buffer.alloc(0));
      const decrypted = service.decrypt(dek, blob);
      expect(decrypted.length).toBe(0);
    });

    it("handles large data (1MB)", () => {
      const dek = service.generateDEK();
      const bigData = Buffer.alloc(1024 * 1024, 0xab);
      const blob = service.encrypt(dek, bigData);
      const decrypted = service.decrypt(dek, blob);
      expect(decrypted.equals(bigData)).toBe(true);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @memo/api exec jest src/encryption/encryption.service.spec.ts --no-coverage`
Expected: FAIL — module not found

**Step 3: Implement EncryptionService**

```typescript
// packages/api/src/encryption/encryption.service.ts
import { Injectable } from "@nestjs/common";
import {
  pbkdf2Sync,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "crypto";

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_DIGEST = "sha512";
const KEY_LENGTH = 32; // AES-256
const NONCE_LENGTH = 12; // GCM standard
const TAG_LENGTH = 16; // GCM auth tag
const ALGORITHM = "aes-256-gcm";

@Injectable()
export class EncryptionService {
  deriveKEK(password: string, salt: Buffer): Buffer {
    return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST);
  }

  generateDEK(): Buffer {
    return randomBytes(KEY_LENGTH);
  }

  generateSalt(): Buffer {
    return randomBytes(KEY_LENGTH);
  }

  wrapDEK(kek: Buffer, dek: Buffer): { encrypted: Buffer; nonce: Buffer } {
    const nonce = randomBytes(NONCE_LENGTH);
    const cipher = createCipheriv(ALGORITHM, kek, nonce);
    const encrypted = Buffer.concat([cipher.update(dek), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { encrypted: Buffer.concat([encrypted, tag]), nonce };
  }

  unwrapDEK(kek: Buffer, encrypted: Buffer, nonce: Buffer): Buffer {
    const ciphertext = encrypted.subarray(0, encrypted.length - TAG_LENGTH);
    const tag = encrypted.subarray(encrypted.length - TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, kek, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /** Returns: nonce (12) || ciphertext || tag (16) */
  encrypt(dek: Buffer, plaintext: Buffer): Buffer {
    const nonce = randomBytes(NONCE_LENGTH);
    const cipher = createCipheriv(ALGORITHM, dek, nonce);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([nonce, ciphertext, tag]);
  }

  /** Input: nonce (12) || ciphertext || tag (16) */
  decrypt(dek: Buffer, blob: Buffer): Buffer {
    const nonce = blob.subarray(0, NONCE_LENGTH);
    const tag = blob.subarray(blob.length - TAG_LENGTH);
    const ciphertext = blob.subarray(NONCE_LENGTH, blob.length - TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, dek, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @memo/api exec jest src/encryption/encryption.service.spec.ts --no-coverage`
Expected: All 10 tests PASS

**Step 5: Commit**

```bash
git add packages/api/src/encryption/encryption.service.ts packages/api/src/encryption/encryption.service.spec.ts
git commit -m "feat(encryption): add EncryptionService with AES-256-GCM + PBKDF2"
```

---

### Task 2: SessionStoreService — in-memory DEK store

**Files:**
- Create: `packages/api/src/encryption/session-store.service.ts`
- Test: `packages/api/src/encryption/session-store.service.spec.ts`

**Step 1: Write the failing tests**

```typescript
// packages/api/src/encryption/session-store.service.spec.ts
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
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @memo/api exec jest src/encryption/session-store.service.spec.ts --no-coverage`
Expected: FAIL — module not found

**Step 3: Implement SessionStoreService**

```typescript
// packages/api/src/encryption/session-store.service.ts
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
    // Allow Node to exit without waiting for interval
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
```

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @memo/api exec jest src/encryption/session-store.service.spec.ts --no-coverage`
Expected: All 5 tests PASS

**Step 5: Commit**

```bash
git add packages/api/src/encryption/session-store.service.ts packages/api/src/encryption/session-store.service.spec.ts
git commit -m "feat(encryption): add SessionStoreService for in-memory DEK storage"
```

---

### Task 3: EncryptionModule — NestJS wiring

**Files:**
- Create: `packages/api/src/encryption/encryption.module.ts`
- Modify: `packages/api/src/app.module.ts:1-25`

**Step 1: Create EncryptionModule**

```typescript
// packages/api/src/encryption/encryption.module.ts
import { Global, Module } from "@nestjs/common";
import { EncryptionService } from "./encryption.service";
import { SessionStoreService } from "./session-store.service";

@Global()
@Module({
  providers: [EncryptionService, SessionStoreService],
  exports: [EncryptionService, SessionStoreService],
})
export class EncryptionModule {}
```

**Step 2: Add to AppModule**

In `packages/api/src/app.module.ts`, add `EncryptionModule` to imports array:

```typescript
import { EncryptionModule } from "./encryption/encryption.module";

// In imports array, add:
EncryptionModule,
```

**Step 3: Run existing tests to verify nothing breaks**

Run: `pnpm --filter @memo/api test --no-coverage`
Expected: All existing tests PASS

**Step 4: Commit**

```bash
git add packages/api/src/encryption/encryption.module.ts packages/api/src/app.module.ts
git commit -m "feat(encryption): add EncryptionModule, register globally"
```

---

### Task 4: Prisma schema migration

**Files:**
- Modify: `prisma/schema.prisma:10-25` (User model)
- Modify: `prisma/schema.prisma:36-53` (Event model)
- Modify: `prisma/schema.prisma:130-143` (AnalysisCache model)

**Step 1: Update Prisma schema**

User model — add 3 new fields:
```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String
  name      String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Encryption (envelope encryption)
  encryptionSalt Bytes?
  encryptedDEK   Bytes?
  dekNonce       Bytes?

  // ... relations unchanged
}
```

Note: fields are nullable (`Bytes?`) because we need to run the migration before the encryption script runs. After the script, all users will have values.

Event model — change types:
```prisma
model Event {
  // ...
  details   Bytes?    // was Json?
  note      Bytes?    // was String?
  // ... rest unchanged
}
```

AnalysisCache model — change type:
```prisma
model AnalysisCache {
  // ...
  result    Bytes     // was Json
  // ... rest unchanged
}
```

**Step 2: Generate and apply Prisma migration**

Run: `cd /Users/cyber_kostyan/git/AI/memo && pnpm prisma migrate dev --name add-encryption-fields`
Expected: Migration created and applied

**Step 3: Generate Prisma client**

Run: `pnpm prisma generate`
Expected: Prisma Client generated

**Step 4: Verify compilation**

Run: `pnpm --filter @memo/api exec tsc --noEmit`
Expected: Will show type errors in services that use `Json`/`String` types — this is expected and will be fixed in subsequent tasks.

**Step 5: Commit**

```bash
git add prisma/
git commit -m "feat(encryption): add encryption fields and change column types in schema"
```

---

### Task 5: Integrate encryption into AuthService (register + login)

**Files:**
- Modify: `packages/api/src/auth/auth.service.ts:1-100`
- Modify: `packages/api/src/auth/auth.service.spec.ts:1-297`

**Step 1: Update auth.service.spec.ts**

Add `EncryptionService` and `SessionStoreService` mocks to the test module setup. Add new tests:

```typescript
// Add to imports
import { EncryptionService } from "../encryption/encryption.service";
import { SessionStoreService } from "../encryption/session-store.service";

// Add to beforeEach mock setup:
let encryption: EncryptionService;
let sessionStore: { set: jest.Mock; get: jest.Mock; delete: jest.Mock };

// In beforeEach:
encryption = new EncryptionService(); // use real crypto
sessionStore = { set: jest.fn(), get: jest.fn(), delete: jest.fn() };

// In Test.createTestingModule providers:
{ provide: EncryptionService, useValue: encryption },
{ provide: SessionStoreService, useValue: sessionStore },

// Update prisma mock to include user.update:
prisma = {
  user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  refreshToken: { ... },
};

// New tests:
describe("register", () => {
  it("generates encryption keys and stores DEK in session", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: "new-user", email: "a@b.com" });
    prisma.user.update.mockResolvedValue({});

    await service.register({
      email: "a@b.com", password: "pass123", name: "Test", consentToHealthData: true,
    });

    // User updated with encryption fields
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "new-user" },
      data: {
        encryptionSalt: expect.any(Buffer),
        encryptedDEK: expect.any(Buffer),
        dekNonce: expect.any(Buffer),
      },
    });
    // DEK stored in session
    expect(sessionStore.set).toHaveBeenCalledWith("new-user", expect.any(Buffer));
  });
});

describe("login", () => {
  it("decrypts DEK and stores in session on login", async () => {
    const enc = new EncryptionService();
    const salt = enc.generateSalt();
    const dek = enc.generateDEK();
    const kek = enc.deriveKEK("password123", salt);
    const { encrypted, nonce } = enc.wrapDEK(kek, dek);
    const hash = await bcrypt.hash("password123", 10);

    prisma.user.findUnique.mockResolvedValue({
      id: "user-1", email: "test@example.com", password: hash,
      encryptionSalt: salt, encryptedDEK: encrypted, dekNonce: nonce,
    });

    await service.login({ email: "test@example.com", password: "password123" });

    expect(sessionStore.set).toHaveBeenCalledWith("user-1", expect.any(Buffer));
    // Verify the stored DEK matches original
    const storedDek = sessionStore.set.mock.calls[0][1];
    expect(storedDek.equals(dek)).toBe(true);
  });
});

describe("logout", () => {
  // Update existing test to also verify session cleanup
  it("deletes refresh token and clears session store", async () => {
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
    await service.logout("token-to-delete", "user-1");
    expect(sessionStore.delete).toHaveBeenCalledWith("user-1");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm --filter @memo/api exec jest src/auth/auth.service.spec.ts --no-coverage`
Expected: FAIL — new tests fail because auth.service doesn't have encryption logic yet

**Step 3: Update AuthService implementation**

Modify `packages/api/src/auth/auth.service.ts`:

- Add constructor deps: `EncryptionService`, `SessionStoreService`
- In `register()`: after creating user, generate salt + DEK, derive KEK, wrap DEK, update user with encryption fields, store DEK in session
- In `login()`: after bcrypt verify, read encryption fields from user, derive KEK, unwrap DEK, store DEK in session
- In `logout()`: add userId param, call `sessionStore.delete(userId)`

**Step 4: Run tests to verify they pass**

Run: `pnpm --filter @memo/api exec jest src/auth/auth.service.spec.ts --no-coverage`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add packages/api/src/auth/auth.service.ts packages/api/src/auth/auth.service.spec.ts
git commit -m "feat(encryption): integrate key generation and DEK session into auth"
```

---

### Task 6: Integrate encryption into EventsService

**Files:**
- Modify: `packages/api/src/events/events.service.ts:1-113`

**Step 1: Update EventsService**

Add `SessionStoreService` and `EncryptionService` to constructor. Add private helper methods:

```typescript
import { UnauthorizedException } from "@nestjs/common";
import { EncryptionService } from "../encryption/encryption.service";
import { SessionStoreService } from "../encryption/session-store.service";

// In constructor:
private sessionStore: SessionStoreService,
private encryption: EncryptionService,

// Private helpers:
private getDEK(userId: string): Buffer {
  const dek = this.sessionStore.get(userId);
  if (!dek) throw new UnauthorizedException("SESSION_ENCRYPTION_EXPIRED");
  return dek;
}

private encryptField(dek: Buffer, data: string | object): Buffer {
  const str = typeof data === "string" ? data : JSON.stringify(data);
  return this.encryption.encrypt(dek, Buffer.from(str, "utf8"));
}

private decryptJson(dek: Buffer, blob: Buffer): unknown {
  return JSON.parse(this.encryption.decrypt(dek, blob).toString("utf8"));
}

private decryptString(dek: Buffer, blob: Buffer): string {
  return this.encryption.decrypt(dek, blob).toString("utf8");
}
```

Update `create()`:
```typescript
async create(userId: string, dto: CreateEventDto) {
  const dek = this.getDEK(userId);
  const event = await this.prisma.event.create({
    data: {
      userId,
      category: dto.category,
      details: dto.details ? this.encryptField(dek, dto.details) : undefined,
      note: dto.note ? this.encryptField(dek, dto.note) : undefined,
      timestamp: dto.timestamp ? new Date(dto.timestamp) : new Date(),
    },
  });
  await this.analysisCache.invalidate(userId);
  return {
    ...event,
    details: dto.details ?? null,
    note: dto.note ?? null,
    attachmentMeta: null,
  };
}
```

Update `findAll()` — after fetching, decrypt details and note for each event.

Update `findOne()` — decrypt after fetch.

Update `update()` — encrypt on write, return decrypted.

**Step 2: Run tests**

Run: `pnpm --filter @memo/api exec jest --no-coverage`
Expected: PASS (update mocks in any events tests if they exist)

**Step 3: Commit**

```bash
git add packages/api/src/events/events.service.ts
git commit -m "feat(encryption): encrypt/decrypt event details and notes"
```

---

### Task 7: Integrate encryption into AttachmentService

**Files:**
- Modify: `packages/api/src/events/attachment.service.ts:1-159`

**Step 1: Update AttachmentService**

Add `SessionStoreService` and `EncryptionService` to constructor.

In `upload()` — encrypt `file.buffer` before storing:
```typescript
const dek = this.getDEK(userId);
const encryptedData = this.encryption.encrypt(dek, file.buffer);
// Use encryptedData instead of file.buffer in upsert
```

In `download()` — decrypt after reading:
```typescript
const dek = this.getDEK(attachment.event.userId);
const decryptedData = this.encryption.decrypt(dek, Buffer.from(attachment.data));
return { ...attachment, data: decryptedData };
```

**Step 2: Run existing attachment tests**

Run: `pnpm --filter @memo/api exec jest src/events/attachment.service.spec.ts --no-coverage`
Expected: PASS (update mocks for EncryptionService and SessionStoreService)

**Step 3: Commit**

```bash
git add packages/api/src/events/attachment.service.ts
git commit -m "feat(encryption): encrypt/decrypt attachment binary data"
```

---

### Task 8: Integrate encryption into AnalysisCacheService

**Files:**
- Modify: `packages/api/src/analysis/analysis-cache.service.ts:1-138`

**Step 1: Update AnalysisCacheService**

Add `SessionStoreService` and `EncryptionService` to constructor.

In `set()` — encrypt `result` before storing:
```typescript
const dek = this.getDEK(userId);
const encrypted = this.encryptField(dek, result);
// Store encrypted as Bytes
```

In `get()`, `getLatest()`, `getById()`, `getHistory()` — decrypt `result` after reading:
```typescript
const dek = this.getDEK(userId);
const result = this.decryptJson(dek, cached.result as Buffer);
```

**Step 2: Verify compilation**

Run: `pnpm --filter @memo/api exec tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add packages/api/src/analysis/analysis-cache.service.ts
git commit -m "feat(encryption): encrypt/decrypt analysis cache results"
```

---

### Task 9: Integrate encryption into AnalysisService

**Files:**
- Modify: `packages/api/src/analysis/analysis.service.ts`

**Step 1: Update AnalysisService**

The analysis service reads events and attachments which are now encrypted `Bytes`. Update `analyze()`:

- After loading events, decrypt `event.details` and `event.note` before transforming for AI
- After loading attachments, decrypt `attachment.data` before base64-encoding for OpenAI
- The result is already handled by AnalysisCacheService (Task 8)

Key change in `transformEvent()` — data arrives as Buffer, decrypt first:
```typescript
const dek = this.sessionStore.get(userId);
// details is already decrypted by the service layer or decrypt here
```

Note: Since analysis.service directly accesses Prisma, it needs to decrypt events itself. Add `EncryptionService` and `SessionStoreService` to constructor.

**Step 2: Verify AI analysis flow compiles**

Run: `pnpm --filter @memo/api exec tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add packages/api/src/analysis/analysis.service.ts
git commit -m "feat(encryption): decrypt events/attachments before AI analysis"
```

---

### Task 10: Integrate encryption into ExportService and PrivacyService

**Files:**
- Modify: `packages/api/src/events/export.service.ts:1-72`
- Modify: `packages/api/src/privacy/privacy.service.ts:1-74`

**Step 1: Update ExportService (XLSX)**

Add `SessionStoreService` and `EncryptionService` to constructor. After fetching events, decrypt `details` and `note` before building spreadsheet rows.

**Step 2: Update PrivacyService (JSON export)**

Add `SessionStoreService` and `EncryptionService` to constructor. In `exportUserData()`, after fetching events, decrypt `details` and `note`.

**Step 3: Verify compilation**

Run: `pnpm --filter @memo/api exec tsc --noEmit`
Expected: No type errors

**Step 4: Commit**

```bash
git add packages/api/src/events/export.service.ts packages/api/src/privacy/privacy.service.ts
git commit -m "feat(encryption): decrypt data in export services"
```

---

### Task 11: Update auth controller — logout with userId

**Files:**
- Modify: `packages/api/src/auth/auth.controller.ts:1-37`

**Step 1: Update logout endpoint**

The `logout` method now needs `userId` to clear the session store. Extract userId from the JWT (request.user):

```typescript
@Post("logout")
@UseGuards(JwtAuthGuard)
async logout(@Body() body: RefreshDto, @Request() req) {
  await this.authService.logout(body.refreshToken, req.user.id);
  return { message: "Logged out" };
}
```

Note: logout currently doesn't require JwtAuthGuard. Adding it means the user needs a valid access token to logout. This is acceptable — if the token is expired, the session store will auto-expire too.

**Step 2: Verify**

Run: `pnpm --filter @memo/api exec tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add packages/api/src/auth/auth.controller.ts
git commit -m "feat(encryption): pass userId to logout for session cleanup"
```

---

### Task 12: Change password endpoint

**Files:**
- Modify: `packages/api/src/auth/auth.service.ts`
- Modify: `packages/api/src/auth/auth.controller.ts`
- Modify: `packages/shared/src/dto/index.ts`
- Test: `packages/api/src/auth/auth.service.spec.ts`

**Step 1: Add DTO in shared package**

```typescript
// In packages/shared/src/dto/index.ts, add:
export const changePasswordDto = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6),
});
export type ChangePasswordDto = z.infer<typeof changePasswordDto>;
```

**Step 2: Write failing test**

```typescript
describe("changePassword", () => {
  it("re-wraps DEK with new password", async () => {
    const enc = new EncryptionService();
    const dek = enc.generateDEK();
    sessionStore.get.mockReturnValue(dek);

    const hash = await bcrypt.hash("oldpass", 10);
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1", password: hash,
    });
    prisma.user.update.mockResolvedValue({});

    await service.changePassword("user-1", {
      oldPassword: "oldpass",
      newPassword: "newpass",
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        password: expect.any(String),
        encryptionSalt: expect.any(Buffer),
        encryptedDEK: expect.any(Buffer),
        dekNonce: expect.any(Buffer),
      },
    });
  });

  it("throws for wrong old password", async () => {
    const hash = await bcrypt.hash("correct", 10);
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1", password: hash,
    });

    await expect(
      service.changePassword("user-1", {
        oldPassword: "wrong",
        newPassword: "newpass",
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
```

**Step 3: Implement changePassword in AuthService**

```typescript
async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
  const user = await this.prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new UnauthorizedException();

  const valid = await bcrypt.compare(dto.oldPassword, user.password);
  if (!valid) throw new UnauthorizedException("Invalid current password");

  const dek = this.sessionStore.get(userId);
  if (!dek) throw new UnauthorizedException("SESSION_ENCRYPTION_EXPIRED");

  const newHash = await bcrypt.hash(dto.newPassword, 10);
  const newSalt = this.encryption.generateSalt();
  const newKek = this.encryption.deriveKEK(dto.newPassword, newSalt);
  const { encrypted, nonce } = this.encryption.wrapDEK(newKek, dek);

  await this.prisma.user.update({
    where: { id: userId },
    data: {
      password: newHash,
      encryptionSalt: newSalt,
      encryptedDEK: encrypted,
      dekNonce: nonce,
    },
  });
}
```

**Step 4: Add controller endpoint**

```typescript
@Post("change-password")
@UseGuards(JwtAuthGuard)
async changePassword(@Body(new ZodPipe(changePasswordDto)) body: ChangePasswordDto, @Request() req) {
  await this.authService.changePassword(req.user.id, body);
  return { message: "Password changed" };
}
```

**Step 5: Run tests**

Run: `pnpm --filter @memo/api exec jest src/auth/auth.service.spec.ts --no-coverage`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/api/src/auth/auth.service.ts packages/api/src/auth/auth.controller.ts packages/shared/src/dto/index.ts packages/api/src/auth/auth.service.spec.ts
git commit -m "feat(encryption): add change-password endpoint with DEK re-wrap"
```

---

### Task 13: Reset password — data deletion

**Files:**
- Modify: `packages/api/src/auth/auth.service.ts`
- Modify: `packages/api/src/auth/auth.controller.ts`
- Modify: `packages/shared/src/dto/index.ts`
- Test: `packages/api/src/auth/auth.service.spec.ts`

Note: The project currently has no forgot/reset password endpoints. Implement a minimal version.

**Step 1: Add DTO**

```typescript
export const resetPasswordDto = z.object({
  email: z.string().email(),
  newPassword: z.string().min(6),
});
export type ResetPasswordDto = z.infer<typeof resetPasswordDto>;
```

Note: In production this should use email verification tokens. For now, implement the core logic (delete data + re-key). The email verification can be added later.

**Step 2: Write failing test**

```typescript
describe("resetPassword", () => {
  it("deletes all encrypted data and generates new encryption keys", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "user-1", email: "a@b.com" });
    prisma.event.deleteMany = jest.fn().mockResolvedValue({ count: 5 });
    prisma.analysisCache.deleteMany = jest.fn().mockResolvedValue({ count: 2 });
    prisma.user.update.mockResolvedValue({});

    await service.resetPassword({ email: "a@b.com", newPassword: "newpass" });

    // All encrypted data deleted
    expect(prisma.event.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(prisma.analysisCache.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    // New encryption keys generated
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: expect.objectContaining({
        password: expect.any(String),
        encryptionSalt: expect.any(Buffer),
        encryptedDEK: expect.any(Buffer),
        dekNonce: expect.any(Buffer),
      }),
    });
  });
});
```

**Step 3: Implement resetPassword**

```typescript
async resetPassword(dto: ResetPasswordDto): Promise<void> {
  const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
  if (!user) return; // don't leak user existence

  // Delete all encrypted data
  await this.prisma.event.deleteMany({ where: { userId: user.id } });
  await this.prisma.analysisCache.deleteMany({ where: { userId: user.id } });

  // Generate new encryption keys
  const newHash = await bcrypt.hash(dto.newPassword, 10);
  const salt = this.encryption.generateSalt();
  const dek = this.encryption.generateDEK();
  const kek = this.encryption.deriveKEK(dto.newPassword, salt);
  const { encrypted, nonce } = this.encryption.wrapDEK(kek, dek);

  await this.prisma.user.update({
    where: { id: user.id },
    data: {
      password: newHash,
      encryptionSalt: salt,
      encryptedDEK: encrypted,
      dekNonce: nonce,
    },
  });

  // Clear any active session
  this.sessionStore.delete(user.id);
}
```

**Step 4: Add controller endpoint**

```typescript
@Post("reset-password")
async resetPassword(@Body(new ZodPipe(resetPasswordDto)) body: ResetPasswordDto) {
  await this.authService.resetPassword(body);
  return { message: "If the account exists, it has been reset" };
}
```

**Step 5: Run tests**

Run: `pnpm --filter @memo/api exec jest src/auth/auth.service.spec.ts --no-coverage`
Expected: All tests PASS

**Step 6: Commit**

```bash
git add packages/api/src/auth/auth.service.ts packages/api/src/auth/auth.controller.ts packages/shared/src/dto/index.ts packages/api/src/auth/auth.service.spec.ts
git commit -m "feat(encryption): add reset-password with data deletion"
```

---

### Task 14: Migration script — encrypt existing data

**Files:**
- Create: `scripts/migrate-encrypt.ts`

**Step 1: Write migration script**

```typescript
// scripts/migrate-encrypt.ts
import { PrismaClient } from "@prisma/client";
import { EncryptionService } from "../packages/api/src/encryption/encryption.service";
import * as readline from "readline";

async function main() {
  const prisma = new PrismaClient();
  const enc = new EncryptionService();

  // Read password from stdin
  const password = await askPassword("Enter user password for encryption: ");

  try {
    // Find all users (should be 1)
    const users = await prisma.user.findMany();
    if (users.length === 0) {
      console.log("No users found. Nothing to migrate.");
      return;
    }

    for (const user of users) {
      if (user.encryptionSalt) {
        console.log(`User ${user.email} already has encryption keys. Skipping.`);
        continue;
      }

      console.log(`Migrating user: ${user.email}`);

      // Generate encryption keys
      const salt = enc.generateSalt();
      const dek = enc.generateDEK();
      const kek = enc.deriveKEK(password, salt);
      const { encrypted: encryptedDEK, nonce: dekNonce } = enc.wrapDEK(kek, dek);

      // Update user with encryption keys
      await prisma.user.update({
        where: { id: user.id },
        data: { encryptionSalt: salt, encryptedDEK, dekNonce },
      });

      // Encrypt all events
      const events = await prisma.event.findMany({ where: { userId: user.id } });
      console.log(`  Encrypting ${events.length} events...`);
      for (const event of events) {
        const data: any = {};
        if (event.details) {
          // details is currently stored as JSON, comes as object from Prisma
          data.details = enc.encrypt(dek, Buffer.from(JSON.stringify(event.details), "utf8"));
        }
        if (event.note) {
          // note is currently stored as String, comes as string from Prisma
          data.note = enc.encrypt(dek, Buffer.from(event.note as string, "utf8"));
        }
        if (Object.keys(data).length > 0) {
          await prisma.event.update({ where: { id: event.id }, data });
        }
      }

      // Encrypt all attachments
      const attachments = await prisma.attachment.findMany({
        where: { event: { userId: user.id } },
      });
      console.log(`  Encrypting ${attachments.length} attachments...`);
      for (const att of attachments) {
        const encryptedData = enc.encrypt(dek, Buffer.from(att.data));
        await prisma.attachment.update({
          where: { id: att.id },
          data: { data: encryptedData },
        });
      }

      // Encrypt all analysis cache entries
      const caches = await prisma.analysisCache.findMany({
        where: { userId: user.id },
      });
      console.log(`  Encrypting ${caches.length} analysis cache entries...`);
      for (const cache of caches) {
        const encryptedResult = enc.encrypt(
          dek,
          Buffer.from(JSON.stringify(cache.result), "utf8"),
        );
        await prisma.analysisCache.update({
          where: { id: cache.id },
          data: { result: encryptedResult },
        });
      }

      console.log(`  Done! User ${user.email} migrated successfully.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

function askPassword(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
```

**Step 2: Add script to package.json**

In root `package.json`, add to scripts:
```json
"migrate:encrypt": "npx tsx scripts/migrate-encrypt.ts"
```

**Step 3: Test script on local DB (manual)**

1. Run `pg_dump` backup first
2. Run: `pnpm migrate:encrypt`
3. Enter user password when prompted
4. Verify data is encrypted in DB

**Step 4: Commit**

```bash
git add scripts/migrate-encrypt.ts package.json
git commit -m "feat(encryption): add one-time data migration script"
```

---

### Task 15: Frontend — session expired handling

**Files:**
- Modify: `packages/web/src/api/client.ts:106-127`

**Step 1: Update 401 handling in api client**

In the auto-refresh logic, detect `SESSION_ENCRYPTION_EXPIRED`:

```typescript
// After the 401 response, before trying refresh:
if (res.status === 401) {
  const body = await res.clone().json().catch(() => ({}));
  if (body.message === "SESSION_ENCRYPTION_EXPIRED") {
    clearTokens();
    window.location.href = "/login";
    throw new ApiError(401, "Session expired. Please log in again.");
  }
  // ... existing refresh logic
}
```

**Step 2: Commit**

```bash
git add packages/web/src/api/client.ts
git commit -m "feat(encryption): handle SESSION_ENCRYPTION_EXPIRED on frontend"
```

---

### Task 16: Frontend — forgot password warning

**Files:**
- Determine the current forgot password / reset password page location on frontend and add warning text.

**Step 1: Find and update reset password page**

If no reset password page exists yet (currently no forgot/reset password endpoints exist), create minimal UI:

- Add a reset password page/component at appropriate route
- Show prominent warning: "Resetting your password will permanently delete all your health data. This cannot be undone."
- Red destructive-action button: "Reset password and delete data"

**Step 2: Commit**

```bash
git add packages/web/src/...
git commit -m "feat(encryption): add reset password page with data loss warning"
```

---

### Task 17: Update EventsModule and AnalysisModule DI

**Files:**
- Modify: `packages/api/src/events/events.module.ts`
- Modify: `packages/api/src/analysis/analysis.module.ts`

**Step 1: Update module providers**

Since `EncryptionModule` is `@Global()`, the services are automatically available. However, verify that `EventsService`, `AttachmentService`, `ExportService`, and `AnalysisCacheService` can inject `EncryptionService` and `SessionStoreService` via constructor.

If NestJS shows DI errors, ensure the modules import `EncryptionModule` or that `@Global()` is working.

**Step 2: Run full test suite**

Run: `pnpm --filter @memo/api test --no-coverage`
Expected: All tests PASS

**Step 3: Verify app starts**

Run: `pnpm --filter @memo/api start:dev`
Expected: App starts without errors

**Step 4: Commit (if any module changes were needed)**

```bash
git add packages/api/src/events/events.module.ts packages/api/src/analysis/analysis.module.ts
git commit -m "fix(encryption): update DI wiring for encryption services"
```

---

### Task 18: Final verification — run all tests

**Step 1: Run full test suite**

Run: `pnpm test --no-coverage`
Expected: All tests PASS across all packages

**Step 2: TypeScript compilation check**

Run: `pnpm --filter @memo/api exec tsc --noEmit`
Expected: No type errors

**Step 3: Manual smoke test**

1. Start the app: `pnpm --filter @memo/api start:dev`
2. Register a new user → verify encryption fields in DB
3. Create an event → verify `details` and `note` are encrypted Bytes in DB
4. Read events → verify they return decrypted JSON
5. Upload attachment → verify `data` is encrypted in DB
6. Run AI analysis → verify it works and result is encrypted in cache
7. Change password → verify DEK re-wrap
8. Logout + login → verify session restored

**Step 4: Final commit if any fixes needed**

```bash
git commit -m "fix(encryption): address issues found during smoke testing"
```
