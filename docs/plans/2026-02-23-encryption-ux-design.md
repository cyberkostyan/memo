# Encryption UX Improvements

## Problem
- Encryption session TTL is 1 hour — too short, users get kicked to login frequently
- SESSION_ENCRYPTION_EXPIRED causes a hard redirect with no explanation
- Users have no visibility into whether their data is encrypted

## Design

### 1. TTL increase to 8 hours
- Change `TTL_MS` in `session-store.service.ts` from 1h to 8h
- Add `GET /auth/session-status` endpoint returning `{ encryptionSessionActive, expiresIn }`

### 2. Encryption indicator in header
- `Shield` icon (lucide-react) left of avatar in `AppHeader.tsx`
- Green (`text-emerald-400`) when session active, amber when < 1h remaining
- Click opens popover with: "End-to-end encrypted", session time remaining, "Only you can read your data"
- Polls `GET /auth/session-status` every 5 minutes

### 3. Toast + redirect on session expiry
- Replace hard `window.location.href = "/login"` with sonner toast + 2s delay
- Toast message: "Encryption session expired. Please sign in to unlock your data."
- Apply to all 4 locations in `client.ts` (api, apiDownload, apiUpload, apiFetchBlob)

## Files affected
- `packages/api/src/encryption/session-store.service.ts` — TTL change
- `packages/api/src/auth/auth.controller.ts` — new endpoint
- `packages/web/src/api/client.ts` — toast + delayed redirect
- `packages/web/src/components/layout/AppHeader.tsx` — shield icon + popover
