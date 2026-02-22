# End-to-End Encryption Design

## Overview

Zero-knowledge encryption for all user health data. The server cannot read stored data without the user's password-derived key. Data Encryption Key (DEK) exists in server memory only during active sessions.

## Decisions

| Decision | Choice |
|----------|--------|
| Encryption model | Session-key hybrid (DEK in server memory) |
| Key management | Envelope encryption (DEK + KEK) |
| Forgot password | Data loss — honest zero-knowledge |
| Encryption scope | Content only (details, note, attachment, analysis) |
| Migration | One-time script, no dual-mode logic |
| Backup | Full pg_dump before deploy |
| Cryptography | AES-256-GCM + PBKDF2-SHA512 (node:crypto) |
| Frontend impact | Minimal (forgot password warning + session expired handling) |

## Section 1: Cryptographic Architecture

### Envelope Encryption Model

```
Password → PBKDF2(password, salt, 600000 iterations) → KEK (Key Encryption Key)
                                                          │
                                                          ▼
                                                AES-256-GCM.decrypt(encryptedDEK)
                                                          │
                                                          ▼
                                                     DEK (Data Encryption Key)
                                                          │
                          ┌────────────────┬──────────────┼──────────────┐
                          ▼                ▼              ▼              ▼
                    Event.details    Event.note    Attachment.data   AnalysisCache.result
                    (AES-256-GCM)   (AES-256-GCM)  (AES-256-GCM)   (AES-256-GCM)
```

### New fields in User model

| Field | Description |
|-------|-------------|
| `encryptionSalt` | Random PBKDF2 salt (32 bytes) |
| `encryptedDEK` | DEK wrapped by KEK (AES-256-GCM) |
| `dekNonce` | Nonce used to encrypt DEK (12 bytes) |

### What is NOT encrypted (open metadata)

- `userId`, `timestamp`, `category`, `rating` — needed for server-side filtering, sorting, pagination
- `email` — needed for authentication
- `Reminder`, `Consent`, `AuditLog` — service data

### What IS encrypted

- `Event.details` (JSON) — health record content
- `Event.note` — user notes
- `Attachment.data` (Bytes) — lab results, medical images
- `AnalysisCache.result` (JSON) — AI analysis results

Each encrypted field stores its nonce inline. Format: `nonce (12 bytes) || ciphertext || auth tag (16 bytes)` — all in one `Bytes` column.

## Section 2: Key Lifecycle and Sessions

### New user registration

1. User enters email + password
2. Server:
   a. `bcrypt(password)` → passwordHash (for authentication, as today)
   b. `randomBytes(32)` → salt
   c. `PBKDF2(password, salt, 600000)` → KEK
   d. `randomBytes(32)` → DEK
   e. `AES-256-GCM(KEK, DEK)` → encryptedDEK
   f. Save: passwordHash, salt, encryptedDEK, dekNonce
   g. KEK wiped from memory
   h. DEK placed in session store (in-memory, bound to userId)
3. All subsequent requests use DEK from session store

### Existing user login

1. User enters email + password
2. Server:
   a. `bcrypt.compare(password, passwordHash)` → OK
   b. `PBKDF2(password, salt, 600000)` → KEK
   c. `AES-256-GCM.decrypt(KEK, encryptedDEK)` → DEK
   d. KEK wiped from memory
   e. DEK placed in session store

### Session Store (DEK in memory)

```
Map<userId, { dek: Buffer, lastAccess: Date }>
```

- DEK lives in memory only while the user is logged in
- Cleanup by TTL (e.g., 1 hour of inactivity) or on logout
- On server restart — all DEKs are lost, users must re-login
- Never persisted anywhere — this is the key guarantee

### Password change (user knows old password)

1. User enters oldPassword + newPassword
2. Server:
   a. DEK already in session store
   b. `PBKDF2(newPassword, newSalt, 600000)` → newKEK
   c. `AES-256-GCM(newKEK, DEK)` → newEncryptedDEK
   d. Update: salt, encryptedDEK, dekNonce, passwordHash
   e. Data is NOT re-encrypted — only the DEK wrapper changes

### Forgot password (data loss)

1. User requests password reset
2. Server:
   a. Generate new DEK, salt, encryptedDEK
   b. DELETE all encrypted user data (events, attachments, analysis cache)
   c. User starts fresh
3. UI shows explicit warning before confirmation

## Section 3: Data Flow

### Creating an Event

1. `dek = sessionStore.get(userId)` — or throw 401
2. `encrypt(dek, JSON.stringify(details))` → encryptedDetails
3. `encrypt(dek, note)` → encryptedNote
4. `prisma.event.create({ category, timestamp, details: encrypted, note: encrypted })`
5. Decrypt before returning response to client

### Reading Events (list)

1. Server filters by category + timestamp in SQL (open fields)
2. Fetches encrypted rows
3. For each row: `decrypt(dek, details)`, `decrypt(dek, note)`
4. Returns decrypted data to client

### Attachment upload/download

- Upload: `file bytes → encrypt(dek, bytes) → store in DB`
- Download: `read encrypted → decrypt(dek, bytes) → return to client`

### AI Analysis

1. Fetch events for period (encrypted in DB)
2. Decrypt each event's details + note using DEK
3. Decrypt attachments (PDF text, images)
4. Build OpenAI payload (plaintext, as today)
5. Call OpenAI → get result
6. `encrypt(dek, JSON(result))` → store in AnalysisCache
7. Return plaintext result to client

### Missing DEK

Any request to encrypted data without DEK in session store:
→ HTTP 401 with code `SESSION_ENCRYPTION_EXPIRED`
→ Frontend redirects to re-login

## Section 4: Database Schema Changes and Migration

### New fields in User

```prisma
model User {
  // ... existing fields ...
  encryptionSalt    Bytes    // PBKDF2 salt (32 bytes)
  encryptedDEK      Bytes    // DEK wrapped by KEK (AES-256-GCM)
  dekNonce          Bytes    // Nonce for DEK encryption (12 bytes)
}
```

Fields are required (not nullable) — after migration all users have keys.

### Column type changes

```
Event.details         Json    → Bytes
Event.note            String? → Bytes?
AnalysisCache.result  Json    → Bytes
```

### Migration — one script

1. `pg_dump` — full backup
2. Prisma migrate — apply new schema
3. Migration script:
   a. Read user password (stdin or env)
   b. Generate salt, DEK
   c. `PBKDF2(password, salt)` → KEK
   d. Wrap DEK, save to User
   e. For each Event: encrypt(details), encrypt(note)
   f. For each Attachment: encrypt(data)
   g. For each AnalysisCache: encrypt(result)
   h. All in one transaction
4. Done — code only works with encrypted data

No dual logic, no `isEncrypted` flag.

## Section 5: Encryption Service

### Module structure

```
packages/api/src/encryption/
  ├── encryption.module.ts        // NestJS module
  ├── encryption.service.ts       // encrypt/decrypt + key derivation
  └── session-store.service.ts    // in-memory DEK store
```

### EncryptionService API

```typescript
class EncryptionService {
  deriveKEK(password: string, salt: Buffer): Buffer
  generateDEK(): Buffer
  wrapDEK(kek: Buffer, dek: Buffer): { encrypted: Buffer, nonce: Buffer }
  unwrapDEK(kek: Buffer, encrypted: Buffer, nonce: Buffer): Buffer
  encrypt(dek: Buffer, plaintext: Buffer): Buffer    // nonce || ciphertext || tag
  decrypt(dek: Buffer, blob: Buffer): Buffer
}
```

### SessionStoreService

```typescript
class SessionStoreService {
  set(userId: string, dek: Buffer): void
  get(userId: string): Buffer | null
  delete(userId: string): void
}
```

Simple `Map<string, { dek: Buffer, lastAccess: Date }>` with periodic TTL cleanup.

### Integration with services

Each service (Events, Attachment, Analysis) adds 2-3 lines:
- Get DEK from session store
- `encrypt()` on write
- `decrypt()` on read

Frontend API contract does not change.

### Error handling

| Situation | Response |
|-----------|----------|
| DEK not in session store | `401 SESSION_ENCRYPTION_EXPIRED` → re-login |
| Decrypt failed (corrupted data) | `500 DECRYPTION_FAILED` + audit log |
| PBKDF2 at login can't decrypt DEK | `401 INVALID_CREDENTIALS` |

### Technology

- Algorithm: AES-256-GCM (`node:crypto`, hardware AES-NI)
- Key derivation: PBKDF2 with SHA-512, 600,000 iterations (OWASP 2024)
- Nonce: 12 bytes random per encryption (GCM standard)
- No external dependencies

## Section 6: Forgot Password and UI Changes

### Forgot password flow

1. User requests password reset (as today)
2. User submits new password via reset link
3. Server:
   a. Verify reset token
   b. DELETE all user's Events (cascades to Attachments) and AnalysisCache
   c. Generate new salt, DEK
   d. `PBKDF2(newPassword)` → KEK → wrap DEK
   e. `bcrypt(newPassword)` → hash
   f. Update User

### Change password flow (knows old password)

1. DEK already in session store
2. `PBKDF2(newPassword, newSalt)` → newKEK
3. `wrapDEK(newKEK, DEK)` → newEncryptedDEK
4. Update User: passwordHash, salt, encryptedDEK, dekNonce
5. Data untouched — only DEK wrapper re-encrypted

### UI changes

1. **Forgot password warning** — before confirmation:
   > Resetting your password will permanently delete all your health data, including events, attachments, and analysis history. This cannot be undone.

2. **Session expired handling** — when API returns `401 SESSION_ENCRYPTION_EXPIRED`:
   → Show "Session expired. Please log in again."
   → Redirect to /login (skip token refresh)

3. **Encryption indicator (optional)** — small lock icon in profile/header: "Your data is encrypted"
