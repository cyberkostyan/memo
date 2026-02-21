# AI Analytics Engine — Design Document

**Date:** 2026-02-21
**Status:** Approved

## Summary

Add an AI-powered health analytics feature to Memo that analyzes user's tracked data (sleep, meals, mood, symptoms, etc.) and provides correlations, trends, anomalies, and actionable recommendations via OpenAI GPT-4o.

## Decisions

| Decision | Choice |
|----------|--------|
| LLM Provider | OpenAI GPT-4o with JSON mode |
| Button Placement | FAB (floating action button, bottom-right, all pages) |
| Results UI | Dedicated page `/ai` |
| GDPR Consent | New consent type `ai_data_sharing` in existing consent system |
| Analysis Period | User-selectable: 7 / 14 / 30 days |
| Caching | PostgreSQL `AnalysisCache` table with invalidation on event changes |
| Response Format | JSON only (structured UI rendering) |
| Architecture | Synchronous (POST → wait → render), ~5-15s with loading state |

## Backend Design

### New Module: `AnalysisModule`

**Endpoint:** `POST /api/analysis`

Request body:
```json
{
  "period": 7 | 14 | 30,
  "focus": null | ["sleep", "mood"]
}
```

Response: Full AI analysis JSON (health_score, correlations, trends, anomalies, recommendations, data_gaps) per spec schema.

**Flow:**
1. JWT auth guard
2. Check `ai_data_sharing` consent → 403 if missing/denied
3. Calculate period (today - N days)
4. Check `AnalysisCache` (userId + periodStart + periodEnd + focusHash)
5. If cache hit → return cached result
6. Load user events via `EventsService.findAll()`
7. Transform events to spec format (duration_hours, quality, amount_ml, etc.)
8. Build system prompt + user payload → call OpenAI API (gpt-4o, json_object mode)
9. Parse and validate JSON response
10. Save to `AnalysisCache`
11. Log to `AuditLog` (action: "ai_analysis")
12. Return to client

### Prisma Model

```prisma
model AnalysisCache {
  id          String   @id @default(uuid())
  userId      String
  periodStart DateTime
  periodEnd   DateTime
  focusHash   String
  result      Json
  createdAt   DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, periodStart, periodEnd, focusHash])
  @@index([userId])
}
```

### Cache Invalidation

On event create/update/delete → `AnalysisCacheService.invalidate(userId)` deletes all cached analyses for the user.

### OpenAI Integration

- Package: `openai` npm package
- Model: `gpt-4o`
- `response_format: { type: "json_object" }`
- System prompt: Full analytics engine prompt from spec (Section 1)
- User message: JSON payload with locale, format, period, focus, entries
- Timeout: 60 seconds
- Env vars: `OPENAI_API_KEY`

## GDPR & Consent

### New Consent Type: `ai_data_sharing`

- Added to existing consent system alongside health_data_processing, marketing, analytics, ccpa_do_not_sell
- Default: `granted: false` (requires explicit opt-in)
- Not mandatory (unlike health_data_processing)

### Privacy Settings Page Update

- New toggle: "AI Data Analysis"
- Description: "Allow your health data to be sent to OpenAI for AI-powered analysis. Your data is used only for analysis and is not stored by the AI provider."

### Endpoint Guard

- `AnalysisController` checks consent before execution
- Missing/denied → `403 { error: "AI_CONSENT_REQUIRED" }`
- Frontend shows consent card on `/ai` page if not granted

### Audit

- Every AI analysis call logged in AuditLog (action: "ai_analysis", resource: "analysis")

## Frontend Design

### FAB Button (all protected pages)

- Position: `fixed bottom-6 right-6`, z-20
- Style: Circular 56px, gradient (violet-500 → indigo-500), glow shadow
- Icon: `Sparkles` from lucide-react
- Animation: Pulsing glow (CSS), bounce on first mount
- Placement: Inside `AppLayout.tsx`
- Action: `navigate('/ai')`

### Page `/ai` — AI Analysis Dashboard

**Layout (top to bottom):**

1. **Header section:**
   - Title "AI Analysis" with Sparkles icon
   - Period selector: 3 chip buttons `7d` / `14d` / `30d` (default: 7d)
   - "Analyze" button (gradient, triggers analysis)

2. **Loading state:**
   - Skeleton cards with pulse animation
   - Text "Analyzing your health data..." with spinner

3. **Results sections:**

   a) **Health Score Card** — Circular progress (0-100), color-coded (red→yellow→green), trend arrow, 5 component mini-scores (0 = "—")

   b) **Summary Card** — 2-3 sentence executive summary

   c) **Correlations Section** — Cards with color coding (positive=green, negative=red), strength badge, confidence, description + example

   d) **Trends Section** — Cards with direction arrows, data point values

   e) **Anomalies Section** (if any) — Warning-styled cards (yellow/red), severity badge

   f) **Recommendations Section** — Cards with priority badge, high priority = gradient border

   g) **Data Gaps Section** (if any) — Info cards (gray), suggestions

4. **Error states:**
   - No consent → consent card with "Enable AI Analysis" → `/settings/privacy`
   - No data → "Not enough data" message
   - API error → retry button

### Sidebar Navigation

- Add "AI Analysis" item with Sparkles icon between "Events" and Settings divider

### Route

- Add `/ai` to protected routes in `App.tsx` → `AnalysisPage`

## New Files

### Backend
- `packages/api/src/analysis/analysis.module.ts`
- `packages/api/src/analysis/analysis.controller.ts`
- `packages/api/src/analysis/analysis.service.ts`
- `packages/api/src/analysis/analysis-cache.service.ts`
- `packages/api/src/analysis/analysis.prompt.ts` (system prompt constant)
- `prisma/migrations/XXXX_add_analysis_cache/migration.sql`

### Frontend
- `packages/web/src/pages/AnalysisPage.tsx`
- `packages/web/src/components/analysis/HealthScoreCard.tsx`
- `packages/web/src/components/analysis/CorrelationCard.tsx`
- `packages/web/src/components/analysis/TrendCard.tsx`
- `packages/web/src/components/analysis/RecommendationCard.tsx`
- `packages/web/src/components/analysis/AnomalyCard.tsx`
- `packages/web/src/components/analysis/DataGapCard.tsx`
- `packages/web/src/components/analysis/ConsentRequired.tsx`
- `packages/web/src/components/layout/AiFab.tsx`
- `packages/web/src/hooks/useAnalysis.ts`

### Shared
- `packages/shared/src/dto/analysis.dto.ts` (Zod schemas for request/response)

## Modified Files

- `packages/api/src/app.module.ts` — import AnalysisModule
- `packages/api/src/events/events.service.ts` — hook cache invalidation
- `packages/api/src/privacy/consent.service.ts` — add ai_data_sharing type
- `packages/web/src/App.tsx` — add /ai route
- `packages/web/src/components/layout/AppLayout.tsx` — add AiFab
- `packages/web/src/components/layout/Sidebar.tsx` — add AI nav item
- `packages/web/src/pages/PrivacySettingsPage.tsx` — add AI consent toggle
- `prisma/schema.prisma` — add AnalysisCache model
- `packages/api/package.json` — add openai dependency

## Environment Variables

- `OPENAI_API_KEY` — OpenAI API key (required for AI analysis)
