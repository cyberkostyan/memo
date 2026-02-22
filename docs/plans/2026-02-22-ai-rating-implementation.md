# AI-Driven Event Rating — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move the `rating` field from user-editable to AI-only, where the AI assigns a 0-10 health benefit score during analysis.

**Architecture:** Extend the existing OpenAI JSON response with a `ratings` array alongside `analysis`. Add `ratedAt` field to Event model for smart re-rating. Remove rating from DTOs and frontend form, keep read-only display.

**Tech Stack:** Prisma (PostgreSQL), NestJS, OpenAI API (gpt-4o, json_object mode), React + Vaul + Radix UI

**Design adjustment:** The design doc mentioned `<!-- RATINGS_JSON -->` HTML comment blocks, but the current API uses `response_format: { type: "json_object" }`. Instead, we add `ratings` as a top-level JSON field in the AI response — same single-call approach, but natively structured.

---

### Task 1: Database Migration — Add `ratedAt` Field and Reset Existing Ratings

**Files:**
- Modify: `prisma/schema.prisma:36-50`
- Create: `prisma/migrations/<generated>/migration.sql`

**Step 1: Add `ratedAt` to Event model in Prisma schema**

In `prisma/schema.prisma`, add `ratedAt` after `rating`:

```prisma
model Event {
  id        String    @id @default(uuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  category  String
  details   Json?
  note      String?
  rating    Int?
  ratedAt   DateTime?
  timestamp DateTime  @default(now())
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([userId, timestamp(sort: Desc)])
  @@index([userId, category])
}
```

**Step 2: Generate and apply migration**

Run:
```bash
cd /Users/cyber_kostyan/git/AI/memo && pnpm prisma migrate dev --name add-rated-at-reset-ratings
```

**Step 3: Reset existing user-set ratings**

After migration is created, edit the generated SQL file to add at the end:

```sql
-- Reset all existing user-set ratings (semantic change: user subjective → AI health score)
UPDATE "Event" SET "rating" = NULL WHERE "rating" IS NOT NULL;
```

Then re-apply or verify the migration ran.

**Step 4: Verify**

Run:
```bash
pnpm prisma migrate status
```
Expected: All migrations applied, no pending.

**Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add ratedAt field to Event, reset existing ratings for AI-only use"
```

---

### Task 2: Remove `rating` From DTOs

**Files:**
- Modify: `packages/shared/src/dto/index.ts:24-37`

**Step 1: Remove `rating` from `createEventDto`**

In `packages/shared/src/dto/index.ts`, change `createEventDto` (line 24-30):

Before:
```typescript
export const createEventDto = z.object({
  category: z.enum(EVENT_CATEGORIES),
  details: z.record(z.unknown()).optional(),
  note: z.string().optional(),
  rating: z.number().int().min(0).max(10).optional(),
  timestamp: z.string().datetime().optional(),
});
```

After:
```typescript
export const createEventDto = z.object({
  category: z.enum(EVENT_CATEGORIES),
  details: z.record(z.unknown()).optional(),
  note: z.string().optional(),
  timestamp: z.string().datetime().optional(),
});
```

**Step 2: Remove `rating` from `updateEventDto`**

Change `updateEventDto` (line 32-37):

Before:
```typescript
export const updateEventDto = z.object({
  details: z.record(z.unknown()).optional(),
  note: z.string().optional(),
  rating: z.number().int().min(0).max(10).nullable().optional(),
  timestamp: z.string().datetime().optional(),
});
```

After:
```typescript
export const updateEventDto = z.object({
  details: z.record(z.unknown()).optional(),
  note: z.string().optional(),
  timestamp: z.string().datetime().optional(),
});
```

**Step 3: Add `ratedAt` to `EventResponse` interface**

Change `EventResponse` (line 118-127) — add `ratedAt`:

```typescript
export interface EventResponse {
  id: string;
  category: string;
  details: Record<string, unknown> | null;
  note: string | null;
  rating: number | null;
  ratedAt: string | null;
  timestamp: string;
  createdAt: string;
  updatedAt: string;
}
```

**Step 4: Verify build**

Run:
```bash
cd /Users/cyber_kostyan/git/AI/memo && pnpm -r build
```

Expected: May show TS errors in events.service.ts (references to `dto.rating`) — these will be fixed in Task 3.

**Step 5: Commit**

```bash
git add packages/shared/src/dto/index.ts
git commit -m "feat: remove rating from event DTOs, add ratedAt to EventResponse"
```

---

### Task 3: Update Events Service — Remove Rating From Create/Update, Reset `ratedAt` on Edit

**Files:**
- Modify: `packages/api/src/events/events.service.ts:22-83`

**Step 1: Remove `rating` from `create()` method**

Change the `create` method (line 22-35):

```typescript
async create(userId: string, dto: CreateEventDto) {
  const event = await this.prisma.event.create({
    data: {
      userId,
      category: dto.category,
      details: (dto.details as Prisma.InputJsonValue) ?? undefined,
      note: dto.note,
      timestamp: dto.timestamp ? new Date(dto.timestamp) : new Date(),
    },
  });
  await this.analysisCache.invalidate(userId);
  return event;
}
```

**Step 2: Update `update()` method — remove rating, reset ratedAt**

Change the `update` method (line 69-83):

```typescript
async update(userId: string, id: string, dto: UpdateEventDto) {
  const event = await this.findOne(userId, id);

  const updated = await this.prisma.event.update({
    where: { id: event.id },
    data: {
      details: dto.details !== undefined ? (dto.details as Prisma.InputJsonValue) : undefined,
      note: dto.note !== undefined ? dto.note : undefined,
      timestamp: dto.timestamp ? new Date(dto.timestamp) : undefined,
      ratedAt: null, // Reset to trigger AI re-rating on next analysis
    },
  });
  await this.analysisCache.invalidate(userId);
  return updated;
}
```

**Step 3: Verify build**

Run:
```bash
cd /Users/cyber_kostyan/git/AI/memo && pnpm -r build
```

Expected: Clean build (no TS errors related to `dto.rating`).

**Step 4: Commit**

```bash
git add packages/api/src/events/events.service.ts
git commit -m "feat: remove rating from event create/update, reset ratedAt on edit"
```

---

### Task 4: Update AI Prompt — Add Rating Instructions

**Files:**
- Modify: `packages/api/src/analysis/analysis.prompt.ts`

**Step 1: Add rating instructions to system prompt**

Add the following to `ANALYSIS_SYSTEM_PROMPT` — insert a new section between "Data Categories" and "Security Rules", and add `event_ratings` to the JSON response schema.

In the Data Categories table, add an `id` column note:
```
Each event entry includes a unique `id` field. Use these IDs in the ratings section.
```

Add a new section after "Analysis Rules":

```
## Event Health Rating

In addition to the analysis JSON, include a top-level `event_ratings` array in your response.
Rate ONLY the events listed in the `events_to_rate` array (provided by ID in the user payload).
Skip any event IDs not in that list.

Each rating is a health benefit score on a 0-10 scale:
- 0-3: harmful or very negative for health (e.g. junk food, very poor sleep, severe symptom)
- 4-5: neutral or mildly negative (e.g. average meal, mild symptom)
- 6-7: acceptable or mildly positive (e.g. decent meal, moderate activity)
- 8-10: beneficial or very positive for health (e.g. nutritious meal, good sleep, exercise)

Consider the FULL context of the day — nearby events can influence the rating.
For example, a large meal might rate lower if followed by digestive symptoms.
```

Add to the JSON response format (at the top level, alongside `analysis`):

```json
{
  "analysis": { ... },
  "event_ratings": [
    { "id": "event-uuid", "score": 7 }
  ]
}
```

**Step 2: Verify the prompt compiles**

Run:
```bash
cd /Users/cyber_kostyan/git/AI/memo && pnpm -r build
```
Expected: Clean build.

**Step 3: Commit**

```bash
git add packages/api/src/analysis/analysis.prompt.ts
git commit -m "feat: add event health rating instructions to AI analysis prompt"
```

---

### Task 5: Update Analysis Service — Pass Event IDs, Parse Ratings, Update DB

**Files:**
- Modify: `packages/api/src/analysis/analysis.service.ts`

This is the core task. Multiple changes to the analysis service:

**Step 1: Add `id` to the `EventEntry` interface and `transformEvent()`**

Change `EventEntry` interface (line 9-14):

```typescript
interface EventEntry {
  id: string;
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
  tags: string[];
}
```

Update `transformEvent` signature (line 142) to accept `id`:

```typescript
private transformEvent(event: {
  id: string;
  category: string;
  timestamp: Date;
  details: any;
  note: string | null;
  rating: number | null;
}): EventEntry {
```

Update the return statement (line 212-217) to include `id`:

```typescript
return {
  id: event.id,
  type: event.category,
  timestamp: event.timestamp.toISOString(),
  data,
  tags,
};
```

**Step 2: Add re-rating logic — determine which events need rating**

Add a new private method `getEventsToRate`:

```typescript
private getEventsToRate(events: Array<{
  id: string;
  rating: number | null;
  ratedAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
  timestamp: Date;
}>): string[] {
  const idsToRate: string[] = [];
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

  for (const event of events) {
    // Rule 1: Never rated
    if (event.rating == null) {
      idsToRate.push(event.id);
      continue;
    }

    // Rule 2: Event edited after last rating
    if (event.ratedAt && event.updatedAt > event.ratedAt) {
      idsToRate.push(event.id);
      continue;
    }

    // Rule 3: New contextual events appeared nearby (±2 hours)
    if (event.ratedAt) {
      const hasNewNeighbor = events.some(
        (other) =>
          other.id !== event.id &&
          other.createdAt > event.ratedAt! &&
          Math.abs(other.timestamp.getTime() - event.timestamp.getTime()) <= TWO_HOURS_MS,
      );
      if (hasNewNeighbor) {
        idsToRate.push(event.id);
      }
    }
  }

  return idsToRate;
}
```

**Step 3: Add `events_to_rate` to the payload in `analyze()`**

In the `analyze` method, after building `entries` (line 70-72), compute IDs to rate and add to payload:

```typescript
const eventsToRate = this.getEventsToRate(events);

const payload = {
  locale: "ru",
  format: "json",
  period: {
    start: periodStart.toISOString(),
    end: periodEnd.toISOString(),
  },
  focus: dto.focus,
  entries,
  events_to_rate: eventsToRate,
};
```

**Step 4: Add rating extraction and DB update after parsing the response**

After `const result = this.parseResponse(raw);` (line 109), add:

```typescript
// Extract and apply event ratings
const rawParsed = JSON.parse(raw.trim());
const eventRatings = this.extractRatings(rawParsed, eventsToRate);
if (eventRatings.length > 0) {
  await this.applyRatings(eventRatings);
}
```

Add the `extractRatings` and `applyRatings` methods:

```typescript
private extractRatings(
  parsed: Record<string, unknown>,
  validIds: string[],
): Array<{ id: string; score: number }> {
  const ratings = parsed.event_ratings;
  if (!Array.isArray(ratings)) {
    if (ratings !== undefined) {
      this.logger.warn("AI response missing or invalid event_ratings field");
    }
    return [];
  }

  const validIdSet = new Set(validIds);
  return ratings
    .filter((r: any) => {
      if (!r || typeof r !== "object") return false;
      if (typeof r.id !== "string" || !validIdSet.has(r.id)) return false;
      if (typeof r.score !== "number" || r.score < 0 || r.score > 10) return false;
      return true;
    })
    .map((r: any) => ({ id: r.id as string, score: Math.round(r.score) }));
}

private async applyRatings(ratings: Array<{ id: string; score: number }>): Promise<void> {
  const now = new Date();
  try {
    await this.prisma.$transaction(
      ratings.map((r) =>
        this.prisma.event.update({
          where: { id: r.id },
          data: { rating: r.score, ratedAt: now },
        }),
      ),
    );
    this.logger.log(`Applied AI ratings to ${ratings.length} events`);
  } catch (error) {
    this.logger.error("Failed to apply AI ratings", error);
  }
}
```

**Step 5: Remove `event_ratings` from the cached/returned result**

The `event_ratings` field should NOT be part of the cached analysis result or returned to the frontend. In `parseResponse`, strip it:

In `parseResponse` (line 231-245), after parsing, delete the field:

```typescript
private parseResponse(raw: string): AnalysisResult {
  let text = raw.trim();

  if (text.startsWith("```")) {
    text = text.split("\n", 1)[1] ?? text;
    if (text.endsWith("```")) {
      text = text.slice(0, -3);
    }
    text = text.trim();
  }

  const result = JSON.parse(text);
  delete result.event_ratings; // Strip ratings from result (handled separately)
  return this.validateResponse(result);
}
```

**Step 6: Verify build**

Run:
```bash
cd /Users/cyber_kostyan/git/AI/memo && pnpm -r build
```
Expected: Clean build.

**Step 7: Commit**

```bash
git add packages/api/src/analysis/analysis.service.ts
git commit -m "feat: AI rates events during analysis with smart re-rating logic"
```

---

### Task 6: Frontend — Remove Rating Slider From EventDetailSheet

**Files:**
- Modify: `packages/web/src/components/events/EventDetailSheet.tsx`

**Step 1: Remove the `rating` state variable**

Remove line 54:
```typescript
const [rating, setRating] = useState<number | "">(event?.rating ?? "");
```

**Step 2: Remove the rating slider block**

Delete lines 196-226 (the entire `{/* Rating */}` section with the range input and labels).

**Step 3: Remove `rating` from the submit handler**

In `handleSubmit`, remove `rating` from both the update DTO (line 123) and create DTO (line 135):

Update case (remove `rating: rating !== "" ? Number(rating) : null,`):
```typescript
const dto: UpdateEventDto = {
  details: Object.keys(cleanDetails).length > 0 ? cleanDetails : undefined,
  note: note || undefined,
  timestamp: ts,
};
```

Create case (remove `rating: rating !== "" ? Number(rating) : undefined,`):
```typescript
const dto: CreateEventDto = {
  category,
  details: Object.keys(cleanDetails).length > 0 ? cleanDetails : undefined,
  note: note || undefined,
  timestamp: ts,
};
```

**Step 4: Add read-only AI rating badge (if event has a rating)**

After the Note textarea section and before the submit button, add a read-only rating display:

```tsx
{/* AI Rating (read-only) */}
{event?.rating != null && (
  <div className="flex items-center justify-between rounded-lg bg-slate-800/50 border border-slate-700/50 px-3 py-2.5">
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500">AI Health Score</span>
    </div>
    <span className="text-sm font-semibold text-indigo-400 tabular-nums">
      {event.rating}/10
    </span>
  </div>
)}
```

**Step 5: Verify build**

Run:
```bash
cd /Users/cyber_kostyan/git/AI/memo && pnpm -r build
```
Expected: Clean build (no references to removed `rating` state).

**Step 6: Commit**

```bash
git add packages/web/src/components/events/EventDetailSheet.tsx
git commit -m "feat: remove rating slider, show read-only AI health score badge"
```

---

### Task 7: Frontend — Add AI Indicator to EventCard Rating Display

**Files:**
- Modify: `packages/web/src/components/events/EventCard.tsx:63-67`

**Step 1: Update the rating display to include an AI indicator**

Replace the current rating display (lines 63-67):

Before:
```tsx
{event.rating != null && (
  <span className="text-xs font-medium text-indigo-400 shrink-0">
    {event.rating}/10
  </span>
)}
```

After:
```tsx
{event.rating != null && (
  <span className="flex items-center gap-1 text-xs font-medium text-indigo-400 shrink-0" title="AI Health Score">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="opacity-60">
      <path d="M12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2Z" />
    </svg>
    {event.rating}/10
  </span>
)}
```

This adds a small star icon before the rating to indicate it's an AI-generated score.

**Step 2: Verify build**

Run:
```bash
cd /Users/cyber_kostyan/git/AI/memo && pnpm -r build
```
Expected: Clean build.

**Step 3: Commit**

```bash
git add packages/web/src/components/events/EventCard.tsx
git commit -m "feat: add AI star indicator to event card rating display"
```

---

### Task 8: Update Export Service — Label Rating as AI Score

**Files:**
- Modify: `packages/api/src/events/export.service.ts:35-56`

**Step 1: Update the "Rating" column header**

Change the column header from "Rating" to "AI Health Score":

```typescript
{ header: "AI Health Score", key: "rating", width: 14 },
```

**Step 2: Verify build**

Run:
```bash
cd /Users/cyber_kostyan/git/AI/memo && pnpm -r build
```
Expected: Clean build.

**Step 3: Commit**

```bash
git add packages/api/src/events/export.service.ts
git commit -m "feat: rename Rating column to AI Health Score in XLSX export"
```

---

### Task 9: Final Verification and Manual Testing

**Step 1: Build everything**

Run:
```bash
cd /Users/cyber_kostyan/git/AI/memo && pnpm -r build
```
Expected: Clean build across all packages.

**Step 2: Verify migration status**

Run:
```bash
cd /Users/cyber_kostyan/git/AI/memo && pnpm prisma migrate status
```
Expected: All migrations applied.

**Step 3: Start dev server and verify**

Run:
```bash
cd /Users/cyber_kostyan/git/AI/memo && pnpm dev
```

Manual checks:
- [ ] Open event creation form → rating slider should NOT appear
- [ ] Open existing event for edit → rating slider should NOT appear
- [ ] If event has a rating → read-only "AI Health Score X/10" badge shows
- [ ] EventCard shows rating with star icon
- [ ] Run AI analysis → check that events get rated (visible on cards after refresh)
- [ ] Edit an event → `ratedAt` should reset (next analysis will re-rate it)

**Step 4: Final commit (if any cleanup needed)**

```bash
git add -A && git commit -m "chore: final cleanup for AI-driven event rating"
```
