# GDPR & CCPA Compliance Design

**Date:** 2026-02-20
**Approach:** Privacy Module (dedicated NestJS module + frontend pages)
**Target:** Full GDPR + CCPA compliance for health data tracking app
**Infrastructure:** Self-hosted, no third-party data processors

## Context

Memo is a health & wellness tracking PWA that stores **special category data** (GDPR Article 9) — mood, symptoms, medications, stool, sleep, exercise. This requires explicit consent and enhanced protection.

## Database Schema

### Consent Table

Tracks user consents with versioning and proof.

```prisma
model Consent {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      String   // "health_data_processing", "marketing", "analytics", "ccpa_do_not_sell"
  version   String   // "1.0", "1.1" — policy version
  granted   Boolean  // true = granted, false = withdrawn
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now())

  @@index([userId, type])
}
```

### AuditLog Table

Logs access to personal data.

```prisma
model AuditLog {
  id         String   @id @default(uuid())
  userId     String?  // who performed the action (null for system)
  targetId   String?  // whose data was affected
  action     String   // "export_data", "delete_account", "view_profile", "update_consent", "login"
  resource   String   // "user", "event", "consent", "reminder"
  details    Json?
  ipAddress  String?
  createdAt  DateTime @default(now())

  @@index([userId, createdAt])
  @@index([targetId, action])
}
```

### DataDeletionRequest Table

Manages account deletion with 30-day grace period.

```prisma
model DataDeletionRequest {
  id           String    @id @default(uuid())
  userId       String
  user         User      @relation(fields: [userId], references: [id])
  status       String    @default("pending") // "pending", "confirmed", "completed", "cancelled"
  reason       String?
  scheduledAt  DateTime  // createdAt + 30 days
  completedAt  DateTime?
  createdAt    DateTime  @default(now())

  @@index([status, scheduledAt])
}
```

## API Endpoints

### Privacy Controller (`/privacy`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/privacy/consents` | Get user's current consents |
| `POST` | `/privacy/consents` | Grant/withdraw consent `{type, granted}` |
| `GET` | `/privacy/consents/history` | Consent change history |
| `GET` | `/privacy/export` | Export all data as JSON (Article 20) |
| `POST` | `/privacy/delete-request` | Request account deletion (requires password) |
| `DELETE` | `/privacy/delete-request` | Cancel deletion request (during grace period) |
| `GET` | `/privacy/delete-request` | Get deletion request status |
| `GET` | `/privacy/audit-log` | User's data access log |

### Consent Flow

1. **Registration** — mandatory `health_data_processing` consent (Article 9)
2. **Settings** — optional consents (`marketing`, `analytics`)
3. **Policy update** — re-consent request with new version
4. **CCPA** — "Do Not Sell" toggle (even if data is not sold)

### Data Export Format

```json
{
  "exportDate": "2026-02-20T12:00:00Z",
  "user": { "id": "...", "email": "...", "name": "...", "createdAt": "..." },
  "events": [...],
  "reminders": [...],
  "consents": [...],
  "pushSubscriptions": [{ "endpoint": "..." }]
}
```

### Account Deletion Flow

1. User → `POST /privacy/delete-request` (+ password verification)
2. DataDeletionRequest created (status: "pending", scheduledAt: now + 30 days)
3. User can continue using the app during grace period
4. User can cancel: `DELETE /privacy/delete-request`
5. After 30 days: cron job executes cascade deletion
6. Audit log entry created, status → "completed"

### Audit Log Interceptor

NestJS interceptor on controllers handling personal data:
- Logs: `/users/*`, `/events/*`, `/reminders/*`, `/privacy/*`
- Skips: auth endpoints (except login), static pages

## Frontend

### New Pages

1. **Privacy Settings Page** (`/settings/privacy`)
   - Consent Management (toggles per consent type)
   - Data Export button (downloads JSON)
   - Delete Account section (password confirmation → grace period)
   - Deletion status (countdown + cancel button)

2. **Privacy Policy Page** (`/privacy-policy`)
   - What data we collect and why
   - How long we store it
   - User rights under GDPR/CCPA
   - Contact information

3. **Cookie Policy Page** (`/cookie-policy`)
   - localStorage usage for JWT tokens
   - No tracking cookies

### New Components

- `ConsentBanner` — shown on first visit or after policy update
- `ConsentManager` — consent toggles in privacy settings
- `DeleteAccountSection` — deletion flow with password confirmation
- `DataExportSection` — export button with download

### Registration Update

- Checkbox: "I consent to the processing of my health data as described in the Privacy Policy"
- Register button disabled until checked
- Consent record created with account

### ProfilePage Integration

New "Privacy & Data" section with link to `/settings/privacy`

## Data Retention Policy

| Data | Retention | Action |
|------|-----------|--------|
| Events (health data) | While account active | Deleted with account |
| Audit Logs | 2 years | Cron cleanup |
| Consent Records | 5 years after withdrawal | Cron cleanup (GDPR proof requirement) |
| Refresh Tokens | 7 days | Already handled |
| Deletion Requests | 1 year after completion | Cron cleanup |
| Inactive accounts | 2 years without login | Notification → deletion |

## Cron Jobs

1. **Account Deletion Executor** — hourly, processes pending requests past scheduledAt
2. **Audit Log Cleanup** — daily, removes entries older than 2 years
3. **Consent Cleanup** — daily, removes withdrawn consents older than 5 years
4. **Inactive Account Warning** — weekly, flags accounts inactive >23 months

## Security Enhancements

- Rate limiting on `/privacy/export` and `/privacy/delete-request` (1/hour)
- Password verification middleware for dangerous operations
- Data minimization in exports

## GDPR Coverage

| Article | Requirement | Implementation |
|---------|-------------|----------------|
| Art. 5 | Processing principles | Data minimization, retention policy, purpose limitation |
| Art. 6 | Lawfulness | Consent-based processing |
| Art. 7 | Consent conditions | Consent model with versions, history, proof |
| Art. 9 | Special category (health) | Explicit consent at registration |
| Art. 12-14 | Transparency | Privacy Policy page, consent banner |
| Art. 15 | Right of access | GET `/privacy/export` |
| Art. 16 | Right to rectification | Existing: PATCH `/users/me`, PATCH `/events/:id` |
| Art. 17 | Right to erasure | POST `/privacy/delete-request` + grace period |
| Art. 18 | Right to restriction | Consent toggles |
| Art. 20 | Right to portability | JSON export |
| Art. 25 | Privacy by design | Audit logs, data minimization |
| Art. 30 | Records of processing | Audit log + documentation |
| Art. 33-34 | Breach notification | Audit log for detection, procedure in Policy |

## CCPA Coverage

| Right | Implementation |
|-------|----------------|
| Right to Know | Privacy Policy + data export |
| Right to Delete | Account deletion flow |
| Right to Opt-Out (Do Not Sell) | Consent toggle `ccpa_do_not_sell` |
| Right to Non-Discrimination | No restrictions on opt-out |

## File Structure

### Backend (`packages/api/src/`)
- `privacy/privacy.module.ts`
- `privacy/privacy.controller.ts`
- `privacy/privacy.service.ts`
- `privacy/consent.service.ts`
- `privacy/audit-log.service.ts`
- `privacy/audit-log.interceptor.ts`
- `privacy/deletion.service.ts`
- `privacy/privacy.cron.ts`
- `privacy/dto/*.ts`

### Shared (`packages/shared/src/`)
- `privacy.dto.ts`

### Frontend (`packages/web/src/`)
- `pages/PrivacySettingsPage.tsx`
- `pages/PrivacyPolicyPage.tsx`
- `pages/CookiePolicyPage.tsx`
- `components/privacy/ConsentBanner.tsx`
- `components/privacy/ConsentManager.tsx`
- `components/privacy/DeleteAccountSection.tsx`
- `components/privacy/DataExportSection.tsx`
- `hooks/useConsent.ts`
- `hooks/usePrivacy.ts`

### Database
- New migration: 3 tables (Consent, AuditLog, DataDeletionRequest)
