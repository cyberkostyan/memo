# XLSX Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to download their health events as a formatted XLSX file from the Journal page, filtered by date range and categories.

**Architecture:** Server-side XLSX generation with ExcelJS. New `GET /events/export` endpoint accepts date range and category filters, queries Prisma, builds a styled workbook, and streams it as a file download. Frontend adds date pickers and an export button to JournalView, triggering a blob download with JWT auth.

**Tech Stack:** ExcelJS (server), NestJS (controller/service), Zod (validation), React (UI)

---

### Task 1: Install ExcelJS dependency

**Files:**
- Modify: `packages/api/package.json`

**Step 1: Install exceljs in the API package**

Run: `pnpm --filter @memo/api add exceljs`

**Step 2: Verify installation**

Run: `pnpm --filter @memo/api exec -- node -e "require('exceljs')"`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/api/package.json pnpm-lock.yaml
git commit -m "Add exceljs dependency for XLSX export"
```

---

### Task 2: Add export query DTO to shared package

The existing `eventQueryDto` uses a single `category` string and pagination fields (`limit`, `offset`). Export needs multiple categories (comma-separated) and no pagination. Create a new DTO.

**Files:**
- Modify: `packages/shared/src/dto/index.ts:36-42`
- Modify: `packages/shared/src/index.ts` (no changes needed — re-exports `./dto`)

**Step 1: Add exportQueryDto to shared DTO file**

In `packages/shared/src/dto/index.ts`, after the `eventQueryDto` (line 42), add:

```typescript
export const exportQueryDto = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  categories: z.string().optional(), // comma-separated: "meal,mood,sleep"
});

export type ExportQueryDto = z.infer<typeof exportQueryDto>;
```

**Step 2: Build shared package to verify**

Run: `pnpm --filter @memo/shared build`
Expected: Successful build, no type errors

**Step 3: Commit**

```bash
git add packages/shared/src/dto/index.ts
git commit -m "Add export query DTO with multi-category support"
```

---

### Task 3: Create ExportService — XLSX generation

**Files:**
- Create: `packages/api/src/events/export.service.ts`

**Step 1: Create the ExportService**

Create `packages/api/src/events/export.service.ts`:

```typescript
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Workbook } from "exceljs";
import type { ExportQueryDto } from "@memo/shared";

const MAX_EXPORT_ROWS = 10_000;

@Injectable()
export class ExportService {
  constructor(private prisma: PrismaService) {}

  async generateXlsx(userId: string, query: ExportQueryDto): Promise<Buffer> {
    const where: any = { userId };

    if (query.categories) {
      const cats = query.categories.split(",").map((c) => c.trim());
      where.category = { in: cats };
    }
    if (query.from || query.to) {
      where.timestamp = {};
      if (query.from) where.timestamp.gte = new Date(query.from);
      if (query.to) where.timestamp.lte = new Date(query.to);
    }

    const events = await this.prisma.event.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: MAX_EXPORT_ROWS,
    });

    const workbook = new Workbook();
    const sheet = workbook.addWorksheet("Events");

    // Header row
    sheet.columns = [
      { header: "Date & Time", key: "timestamp", width: 20 },
      { header: "Category", key: "category", width: 14 },
      { header: "Details", key: "details", width: 40 },
      { header: "Note", key: "note", width: 30 },
      { header: "Rating", key: "rating", width: 10 },
    ];

    // Bold header + freeze
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    // Data rows
    for (const event of events) {
      sheet.addRow({
        timestamp: new Date(event.timestamp),
        category: event.category,
        details: this.flattenDetails(event.details),
        note: event.note ?? "",
        rating: event.rating ?? "",
      });
    }

    // Format date column
    sheet.getColumn("timestamp").numFmt = "yyyy-mm-dd hh:mm";

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private flattenDetails(details: unknown): string {
    if (!details || typeof details !== "object") return "";
    return Object.entries(details as Record<string, unknown>)
      .filter(([, v]) => v != null && v !== "")
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
  }
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm --filter @memo/api exec -- tsc --noEmit`
Expected: No type errors

**Step 3: Commit**

```bash
git add packages/api/src/events/export.service.ts
git commit -m "Add ExportService for XLSX generation"
```

---

### Task 4: Add export route to EventsController

The `/export` route MUST be declared before the `/:id` route, otherwise NestJS will match "export" as an `:id` parameter.

**Files:**
- Modify: `packages/api/src/events/events.controller.ts:1-17` (imports)
- Modify: `packages/api/src/events/events.controller.ts:20-37` (add route before findOne)

**Step 1: Add imports**

In `packages/api/src/events/events.controller.ts`, update imports:

Add `Res, Header` to the `@nestjs/common` imports (line 1-11).
Add import for `ExportService` and `exportQueryDto`.
Add `import type { Response } from "express";`

Updated import block:

```typescript
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Res,
  Header,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { EventsService } from "./events.service";
import { ExportService } from "./export.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/user.decorator";
import { ZodPipe } from "../common/zod.pipe";
import {
  createEventDto,
  updateEventDto,
  eventQueryDto,
  exportQueryDto,
} from "@memo/shared";
```

**Step 2: Inject ExportService and add export route**

Add `ExportService` to the constructor:

```typescript
constructor(
  private events: EventsService,
  private exportService: ExportService,
) {}
```

Add the export route BETWEEN `findAll()` and `findOne()` (before `:id` routes):

```typescript
@Get("export")
@Header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
async export(
  @CurrentUser("id") userId: string,
  @Query(new ZodPipe(exportQueryDto)) query: unknown,
  @Res() res: Response,
) {
  const buffer = await this.exportService.generateXlsx(userId, query as any);
  const date = new Date().toISOString().split("T")[0];
  res.setHeader("Content-Disposition", `attachment; filename="memo-export-${date}.xlsx"`);
  res.send(buffer);
}
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm --filter @memo/api exec -- tsc --noEmit`
Expected: No type errors

**Step 4: Commit**

```bash
git add packages/api/src/events/events.controller.ts
git commit -m "Add GET /events/export endpoint for XLSX download"
```

---

### Task 5: Register ExportService in EventsModule

**Files:**
- Modify: `packages/api/src/events/events.module.ts`

**Step 1: Add ExportService to providers**

Update `packages/api/src/events/events.module.ts`:

```typescript
import { Module } from "@nestjs/common";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";
import { ExportService } from "./export.service";

@Module({
  controllers: [EventsController],
  providers: [EventsService, ExportService],
})
export class EventsModule {}
```

**Step 2: Full build check**

Run: `pnpm --filter @memo/shared build && pnpm --filter @memo/api exec -- tsc --noEmit`
Expected: No errors

**Step 3: Commit**

```bash
git add packages/api/src/events/events.module.ts
git commit -m "Register ExportService in EventsModule"
```

---

### Task 6: Add date range filter to JournalView

Currently JournalView only has category chip filters. Add date range inputs so users can filter by period (needed for meaningful export).

**Files:**
- Modify: `packages/web/src/components/journal/JournalView.tsx`

**Step 1: Add date state and update fetchEvents call**

In `packages/web/src/components/journal/JournalView.tsx`:

Add state for date range after the existing `filter` state (line 14):

```typescript
const [dateFrom, setDateFrom] = useState("");
const [dateTo, setDateTo] = useState("");
```

Update `loadEvents` to include date range (line 17-22):

```typescript
const loadEvents = useCallback(() => {
  fetchEvents({
    category: filter ?? undefined,
    from: dateFrom ? new Date(dateFrom).toISOString() : undefined,
    to: dateTo ? new Date(dateTo + "T23:59:59").toISOString() : undefined,
    limit: 100,
  });
}, [fetchEvents, filter, dateFrom, dateTo]);
```

**Step 2: Add date picker UI**

Add date range inputs before the category chips (before line 48):

```tsx
{/* Date range filter */}
<div className="flex gap-2 px-4 pt-3">
  <input
    type="date"
    value={dateFrom}
    onChange={(e) => setDateFrom(e.target.value)}
    className="flex-1 bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-1.5 border border-slate-700"
    placeholder="From"
  />
  <span className="text-slate-500 self-center">—</span>
  <input
    type="date"
    value={dateTo}
    onChange={(e) => setDateTo(e.target.value)}
    className="flex-1 bg-slate-800 text-slate-200 text-sm rounded-lg px-3 py-1.5 border border-slate-700"
    placeholder="To"
  />
</div>
```

**Step 3: Verify in browser**

Run: `pnpm dev`
Navigate to Journal page, verify date pickers appear and filter events.

**Step 4: Commit**

```bash
git add packages/web/src/components/journal/JournalView.tsx
git commit -m "Add date range filter to JournalView"
```

---

### Task 7: Add export button and download logic

**Files:**
- Modify: `packages/web/src/api/client.ts` (add blob download helper)
- Modify: `packages/web/src/components/journal/JournalView.tsx` (add export button)

**Step 1: Add apiDownload helper to API client**

In `packages/web/src/api/client.ts`, add after the `api` function (after line 78):

```typescript
export async function apiDownload(path: string): Promise<void> {
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  let res = await fetch(`${API_BASE}${path}`, { headers });

  if (res.status === 401 && refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers["Authorization"] = `Bearer ${accessToken}`;
      res = await fetch(`${API_BASE}${path}`, { headers });
    }
  }

  if (!res.ok) {
    throw new ApiError(res.status, "Export failed");
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const filename =
    res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ??
    "memo-export.xlsx";

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

**Step 2: Add export button to JournalView**

In `packages/web/src/components/journal/JournalView.tsx`:

Add import at top:

```typescript
import { apiDownload } from "../../api/client";
```

Add state for export loading after the date states:

```typescript
const [exporting, setExporting] = useState(false);
```

Add export handler after `handleDelete`:

```typescript
const handleExport = async () => {
  setExporting(true);
  try {
    const params = new URLSearchParams();
    if (dateFrom) params.set("from", new Date(dateFrom).toISOString());
    if (dateTo) params.set("to", new Date(dateTo + "T23:59:59").toISOString());
    if (filter) params.set("categories", filter);
    const qs = params.toString();
    await apiDownload(`/events/export${qs ? `?${qs}` : ""}`);
  } catch {
    alert("Export failed. Please try again.");
  } finally {
    setExporting(false);
  }
};
```

Add export button after the category chips section (after the closing `</div>` of the chips wrapper):

```tsx
{/* Export button */}
<div className="px-4 py-2">
  <button
    onClick={handleExport}
    disabled={exporting}
    className="w-full py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
  >
    {exporting ? "Exporting..." : "Export XLSX"}
  </button>
</div>
```

**Step 3: Verify in browser**

Run: `pnpm dev`
Navigate to Journal page, set a date range, click "Export XLSX", verify file downloads.

**Step 4: Commit**

```bash
git add packages/web/src/api/client.ts packages/web/src/components/journal/JournalView.tsx
git commit -m "Add XLSX export button with download logic to Journal"
```

---

### Task 8: End-to-end verification

**Step 1: Start the full stack**

Run: `docker compose up -d && pnpm dev`

**Step 2: Test scenarios**

1. Login to the app
2. Create a few events across different categories
3. Go to Journal
4. Verify date range filter works
5. Click "Export XLSX" — verify file downloads
6. Open the XLSX in Excel/Numbers — verify:
   - Header row is bold and frozen
   - Date column is formatted
   - Details column shows flattened key-value pairs
   - All filtered events are present
7. Set specific date range + category filter, export again — verify only matching events

**Step 3: Test edge cases**

- Export with no events in range — verify XLSX has headers only
- Export with no filters — verify all events export
- Export while logged out — verify 401 handling

**Step 4: Final commit if any fixes needed**

```bash
git add -u
git commit -m "Fix: [description of any issues found]"
```
