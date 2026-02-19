# XLSX Export Feature Design

## Overview

Server-side XLSX export for health events. Users can download their data as a formatted Excel file directly from the Journal page, using the same filters (date range, categories) already applied to the view.

## Architecture

```
[Frontend - JournalPage]              [Backend - NestJS]
  Existing filters (dates, categories)
  + "Export XLSX" button
        │
        ▼
  GET /events/export?from=&to=&categories=
        │
        ▼
  EventsController.export()
        │
        ▼
  ExportService.generateXlsx()
    ├─ Query events from DB (Prisma)
    ├─ Build workbook via ExcelJS
    └─ Stream XLSX response
        │
        ▼
  Browser downloads .xlsx file
```

## API Endpoint

**`GET /events/export`** (authenticated)

Query parameters:
- `from` (ISO date string, optional) — start of date range
- `to` (ISO date string, optional) — end of date range
- `categories` (comma-separated string, optional) — filter by event categories

Response:
- Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- Content-Disposition: `attachment; filename="memo-export-YYYY-MM-DD.xlsx"`

## XLSX Structure

Single sheet "Events" with columns:

| Column | Source | Format |
|--------|--------|--------|
| Date & Time | `event.timestamp` | Localized datetime |
| Category | `event.category` | Category name |
| Details | `event.details` (JSONB) | Flattened key-value pairs, comma-separated |
| Note | `event.note` | Plain text |
| Rating | `event.rating` | Number (if present) |

Styling:
- Bold header row with freeze pane
- Auto-width columns
- Date formatting

## Frontend Changes

Add "Export XLSX" button to JournalPage that:
1. Takes current filter state (date range, selected categories)
2. Constructs export URL with query parameters
3. Triggers file download via `window.location` or anchor tag
4. Shows loading state during download

## Files to Create/Modify

### New files:
- `packages/api/src/events/export.service.ts` — XLSX generation logic
- `packages/shared/src/dto/export.dto.ts` — Zod validation schema for export query params

### Modified files:
- `packages/api/src/events/events.controller.ts` — add `/export` route
- `packages/api/src/events/events.module.ts` — register ExportService
- `packages/web/src/pages/JournalPage.tsx` — add export button

## Dependencies

- `exceljs` — MIT licensed, supports streaming, formatting, and styles

## Error Handling

- No data for period: return XLSX with headers only + toast "No events found for the selected period"
- Too many records: limit to 10,000 rows with user notification
- Generation failure: HTTP 500 + error toast on frontend

## Decisions Made

- **Server-side generation** over client-side: reliable on all devices, better formatting support
- **Single sheet** over multi-sheet: simpler, all data at a glance, easy to filter in Excel
- **Journal page placement** over Profile: reuses existing filters, WYSIWYG export
- **ExcelJS** over SheetJS: MIT license, better styling API, streaming support
