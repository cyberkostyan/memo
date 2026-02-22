# AI-Driven Event Rating

## Summary

Move the `rating` field from user-editable to AI-only. The AI assigns a unified 0-10 health benefit score to each event during analysis. Smart re-rating logic ensures events are re-evaluated when edited or when new contextual events appear nearby.

## Approach

**Approach A: Extend current analysis** (selected over "two-step" and "structured output" alternatives).

Single OpenAI call returns markdown analysis + a `<!-- RATINGS_JSON -->` block. Server parses the block, updates ratings in DB, and strips it from the user-facing response.

## Schema Changes

```prisma
model Event {
  ...
  rating    Int?
  ratedAt   DateTime?    // when AI last rated this event
  ...
}
```

Migration also resets all existing user-set ratings to NULL (semantic change: user subjective → AI health score).

## Re-rating Logic

An event needs (re-)rating when ANY of these is true:

1. `rating IS NULL` — never rated
2. `updatedAt > ratedAt` — event was edited after last rating
3. Contextual: a new event was created within ±2 hours of a rated event (neighbor's `createdAt > this.ratedAt`)

Events not matching any condition are skipped (token savings). All events are still sent to AI for context, but only flagged ones are requested for rating.

## AI Prompt Changes

Add to system prompt in `analysis.prompt.ts`:

- Instruction to output a ratings block: `<!-- RATINGS_JSON [{id, score}] /RATINGS_JSON -->`
- Rating scale description (0-3 harmful, 4-5 neutral, 6-7 acceptable, 8-10 beneficial)
- List of event IDs that need rating (subset of all events sent)

Pass event `id` in the `transformEvent()` output so AI can reference it.

## Response Parsing (`analysis.service.ts`)

1. Extract `<!-- RATINGS_JSON ... /RATINGS_JSON -->` via regex
2. Parse JSON array: `[{id: string, score: number}]`
3. Validate: score must be 0-10 integer, id must exist in analyzed events
4. Strip the RATINGS_JSON block from markdown (user sees clean analysis)
5. Batch update `rating` and `ratedAt` for valid entries
6. If block is missing or unparseable — save analysis anyway, log warning

## Frontend Changes

### Remove from edit form
- `EventDetailSheet.tsx`: remove the rating slider entirely
- User can no longer set rating on create or edit

### Read-only display
- `EventCard.tsx`: keep `{rating}/10` display, add subtle AI indicator
- `EventDetailSheet.tsx`: show rating as read-only badge (or "Not rated" if null)

### DTO changes
- `createEventDto`: remove `rating` field
- `updateEventDto`: remove `rating` field
- On event update: server resets `ratedAt = null` to trigger re-rating

## Error Handling

| Scenario | Behavior |
|----------|----------|
| AI returns no RATINGS_JSON block | Analysis saved, ratings unchanged, log warning |
| Score out of 0-10 range | Skip that rating, apply others |
| Unknown event ID in response | Skip it (hallucination protection) |
| JSON parse failure | Analysis saved, ratings unchanged, log warning |

## Files Affected

- `prisma/schema.prisma` — add `ratedAt` field
- `prisma/migrations/` — new migration (add ratedAt, reset existing ratings)
- `packages/shared/src/dto/index.ts` — remove rating from DTOs
- `packages/api/src/analysis/analysis.prompt.ts` — add rating instructions
- `packages/api/src/analysis/analysis.service.ts` — re-rating logic, response parsing, DB update
- `packages/api/src/events/events.service.ts` — reset ratedAt on event update
- `packages/web/src/components/events/EventDetailSheet.tsx` — remove slider, add read-only badge
- `packages/web/src/components/events/EventCard.tsx` — add AI indicator to rating display
