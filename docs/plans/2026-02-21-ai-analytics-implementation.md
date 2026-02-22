# AI Analytics Engine — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add AI-powered health analytics with FAB button, dedicated /ai page, OpenAI GPT-4o integration, GDPR consent, and PostgreSQL caching.

**Architecture:** Synchronous POST /api/analysis endpoint. NestJS backend loads user events, transforms to spec format, calls OpenAI GPT-4o with JSON mode, caches result in PostgreSQL. React frontend renders structured JSON as dashboard cards.

**Tech Stack:** NestJS, Prisma, OpenAI SDK, React, Tailwind CSS, Zod, Vaul, Lucide React, Motion

---

### Task 1: Add Shared Zod DTOs for Analysis

**Files:**
- Create: `packages/shared/src/dto/analysis.dto.ts`
- Modify: `packages/shared/src/dto/index.ts`
- Modify: `packages/shared/src/dto/privacy.dto.ts`

**Step 1: Add `ai_data_sharing` to CONSENT_TYPES**

In `packages/shared/src/dto/privacy.dto.ts`, update the CONSENT_TYPES array:

```typescript
export const CONSENT_TYPES = [
  "health_data_processing",
  "marketing",
  "analytics",
  "ccpa_do_not_sell",
  "ai_data_sharing",
] as const;
```

**Step 2: Create `packages/shared/src/dto/analysis.dto.ts`**

```typescript
import { z } from "zod";
import { EVENT_CATEGORIES } from "../event-types";

// Request DTO
export const analysisRequestDto = z.object({
  period: z.union([z.literal(7), z.literal(14), z.literal(30)]),
  focus: z.array(z.enum(EVENT_CATEGORIES)).nullable().default(null),
});

export type AnalysisRequestDto = z.infer<typeof analysisRequestDto>;

// Response types (from AI)

export interface AnalysisHealthScore {
  value: number;
  trend: "improving" | "stable" | "declining";
  components: {
    sleep: number;
    nutrition: number;
    activity: number;
    digestion: number;
    mood: number;
  };
}

export interface AnalysisCorrelation {
  id: string;
  factor_a: { category: string; metric: string };
  factor_b: { category: string; metric: string };
  direction: "positive" | "negative";
  strength: "strong" | "moderate" | "weak";
  confidence: "high" | "medium" | "low";
  data_points: number;
  description: string;
  example: string;
}

export interface AnalysisTrend {
  id: string;
  category: string;
  metric: string;
  direction: "improving" | "declining" | "stable" | "cyclical";
  period_days: number;
  description: string;
  data_points: Array<{ date: string; value: number }>;
}

export interface AnalysisAnomaly {
  id: string;
  date: string;
  category: string;
  description: string;
  severity: "info" | "warning" | "alert";
  possible_causes: string[];
}

export interface AnalysisRecommendation {
  id: string;
  priority: "high" | "medium" | "low";
  category: string;
  title: string;
  description: string;
  based_on: string[];
  actionable: boolean;
}

export interface AnalysisDataGap {
  category: string;
  issue: "missing" | "insufficient" | "irregular";
  suggestion: string;
}

export interface AnalysisResult {
  analysis: {
    period: {
      start: string;
      end: string;
      total_days: number;
    };
    summary: string;
    health_score: AnalysisHealthScore;
    correlations: AnalysisCorrelation[];
    trends: AnalysisTrend[];
    anomalies: AnalysisAnomaly[];
    recommendations: AnalysisRecommendation[];
    data_gaps: AnalysisDataGap[];
  };
}
```

**Step 3: Export from `packages/shared/src/dto/index.ts`**

Add at the bottom of the file:

```typescript
// Analysis DTOs
export {
  analysisRequestDto,
  type AnalysisRequestDto,
  type AnalysisResult,
  type AnalysisHealthScore,
  type AnalysisCorrelation,
  type AnalysisTrend,
  type AnalysisAnomaly,
  type AnalysisRecommendation,
  type AnalysisDataGap,
} from "./analysis.dto";
```

**Step 4: Verify build**

Run: `pnpm --filter @memo/shared build` (or `pnpm lint` if no build step)
Expected: No TypeScript errors

**Step 5: Commit**

```bash
git add packages/shared/src/dto/analysis.dto.ts packages/shared/src/dto/index.ts packages/shared/src/dto/privacy.dto.ts
git commit -m "feat: add analysis DTOs and ai_data_sharing consent type"
```

---

### Task 2: Prisma Schema + Migration

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add AnalysisCache model to `prisma/schema.prisma`**

Add the relation to the User model (after `dataDeletionRequests`):

```prisma
  analysisCaches    AnalysisCache[]
```

Add the new model at the end of the file:

```prisma
model AnalysisCache {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  periodStart DateTime
  periodEnd   DateTime
  focusHash   String
  result      Json
  createdAt   DateTime @default(now())

  @@unique([userId, periodStart, periodEnd, focusHash])
  @@index([userId])
}
```

**Step 2: Generate and run migration**

Run: `pnpm prisma:migrate -- --name add_analysis_cache`
Expected: Migration created and applied successfully

**Step 3: Generate Prisma client**

Run: `pnpm prisma:generate`
Expected: Prisma Client generated

**Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add AnalysisCache table for AI analytics"
```

---

### Task 3: Install OpenAI SDK

**Files:**
- Modify: `packages/api/package.json`

**Step 1: Install openai package**

Run: `pnpm --filter @memo/api add openai`
Expected: Package added to dependencies

**Step 2: Update .env.example**

Add to `.env.example`:

```env
# OpenAI (for AI health analysis)
OPENAI_API_KEY="sk-your-openai-api-key"
```

**Step 3: Add OPENAI_API_KEY to your local .env**

Add your actual OpenAI API key to `.env`.

**Step 4: Commit**

```bash
git add packages/api/package.json pnpm-lock.yaml .env.example
git commit -m "chore: add openai SDK dependency"
```

---

### Task 4: Backend — Analysis System Prompt

**Files:**
- Create: `packages/api/src/analysis/analysis.prompt.ts`

**Step 1: Create the system prompt constant**

Create `packages/api/src/analysis/analysis.prompt.ts`:

```typescript
export const ANALYSIS_SYSTEM_PROMPT = `You are the analytics engine of "Memo" — a personal health & wellness tracker.
Your role is to analyze structured health data and identify correlations,
patterns, and actionable insights across multiple dimensions of a user's life.

## Your Capabilities

1. **Correlation Analysis** — find statistical and temporal links between
   tracked categories (sleep ↔ mood, meals ↔ symptoms, exercise ↔ energy, etc.)
2. **Trend Detection** — identify improving, worsening, or cyclical patterns
   over time windows (daily, weekly, monthly)
3. **Anomaly Detection** — flag unusual data points or sudden changes
4. **Actionable Recommendations** — provide evidence-based, personalized
   suggestions grounded ONLY in the user's own data

## Data Categories You Receive

| Category   | Key Fields                                                    |
|------------|---------------------------------------------------------------|
| meal       | timestamp, description, rating (1-10), tags[]                 |
| stool      | timestamp, bristol_type (1-7), tags[]                         |
| mood       | timestamp, score (1-10), tags[], note                         |
| symptom    | timestamp, type, severity (1-10), duration_min, tags[]        |
| medication | timestamp, name, dose, unit, tags[]                           |
| exercise   | timestamp, type, duration_min, intensity (1-10), tags[]       |
| water      | timestamp, amount_ml, tags[], note                            |
| sleep      | timestamp, duration_hours, quality (1-5), tags[]              |
| note       | timestamp, text, tags[]                                       |

## Analysis Rules

- NEVER fabricate data points or statistics — only reference data provided
- Specify confidence: HIGH (≥5 supporting data points), MEDIUM (3-4), LOW (1-2)
- Distinguish correlation from causation explicitly
- When data is insufficient, state what additional tracking would help
- Respect time zones — all timestamps are in the user's local time
- Consider lag effects (e.g. poor sleep may affect mood the NEXT day)
- Account for confounding variables when possible
- Use the user's language (detect from data/notes or from the \`locale\` field)

## Response Format

You MUST respond with valid JSON matching the schema below.
No markdown, no commentary outside the JSON structure.

{
  "analysis": {
    "period": {
      "start": "ISO-8601",
      "end": "ISO-8601",
      "total_days": number
    },
    "summary": "2-3 sentence executive summary in user's language",
    "health_score": {
      "value": number (0-100),
      "trend": "improving" | "stable" | "declining",
      "components": {
        "sleep": number (0-100),
        "nutrition": number (0-100),
        "activity": number (0-100),
        "digestion": number (0-100),
        "mood": number (0-100)
      }
    },
    "correlations": [
      {
        "id": "unique-correlation-id",
        "factor_a": { "category": string, "metric": string },
        "factor_b": { "category": string, "metric": string },
        "direction": "positive" | "negative",
        "strength": "strong" | "moderate" | "weak",
        "confidence": "high" | "medium" | "low",
        "data_points": number,
        "description": "human-readable explanation",
        "example": "specific example from data with dates"
      }
    ],
    "trends": [
      {
        "id": "unique-trend-id",
        "category": string,
        "metric": string,
        "direction": "improving" | "declining" | "stable" | "cyclical",
        "period_days": number,
        "description": string,
        "data_points": [
          { "date": "ISO-8601", "value": number }
        ]
      }
    ],
    "anomalies": [
      {
        "id": "unique-anomaly-id",
        "date": "ISO-8601",
        "category": string,
        "description": string,
        "severity": "info" | "warning" | "alert",
        "possible_causes": string[]
      }
    ],
    "recommendations": [
      {
        "id": "unique-rec-id",
        "priority": "high" | "medium" | "low",
        "category": string,
        "title": string,
        "description": string,
        "based_on": string[],
        "actionable": true
      }
    ],
    "data_gaps": [
      {
        "category": string,
        "issue": "missing" | "insufficient" | "irregular",
        "suggestion": string
      }
    ]
  }
}`;
```

**Step 2: Commit**

```bash
git add packages/api/src/analysis/analysis.prompt.ts
git commit -m "feat: add AI analysis system prompt"
```

---

### Task 5: Backend — AnalysisCacheService

**Files:**
- Create: `packages/api/src/analysis/analysis-cache.service.ts`

**Step 1: Create `packages/api/src/analysis/analysis-cache.service.ts`**

```typescript
import { Injectable } from "@nestjs/common";
import { createHash } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import type { Prisma } from "@prisma/client";

@Injectable()
export class AnalysisCacheService {
  constructor(private prisma: PrismaService) {}

  private hashFocus(focus: string[] | null): string {
    if (!focus || focus.length === 0) return "all";
    return createHash("sha256")
      .update(JSON.stringify(focus.sort()))
      .digest("hex")
      .slice(0, 16);
  }

  async get(
    userId: string,
    periodStart: Date,
    periodEnd: Date,
    focus: string[] | null,
  ) {
    const focusHash = this.hashFocus(focus);
    const cached = await this.prisma.analysisCache.findUnique({
      where: {
        userId_periodStart_periodEnd_focusHash: {
          userId,
          periodStart,
          periodEnd,
          focusHash,
        },
      },
    });
    return cached?.result ?? null;
  }

  async set(
    userId: string,
    periodStart: Date,
    periodEnd: Date,
    focus: string[] | null,
    result: Prisma.InputJsonValue,
  ) {
    const focusHash = this.hashFocus(focus);
    return this.prisma.analysisCache.upsert({
      where: {
        userId_periodStart_periodEnd_focusHash: {
          userId,
          periodStart,
          periodEnd,
          focusHash,
        },
      },
      update: { result, createdAt: new Date() },
      create: {
        userId,
        periodStart,
        periodEnd,
        focusHash,
        result,
      },
    });
  }

  async invalidate(userId: string) {
    return this.prisma.analysisCache.deleteMany({
      where: { userId },
    });
  }
}
```

**Step 2: Commit**

```bash
git add packages/api/src/analysis/analysis-cache.service.ts
git commit -m "feat: add AnalysisCacheService for caching AI results"
```

---

### Task 6: Backend — AnalysisService (OpenAI integration)

**Files:**
- Create: `packages/api/src/analysis/analysis.service.ts`

**Step 1: Create `packages/api/src/analysis/analysis.service.ts`**

This service handles event transformation and OpenAI API calls.

```typescript
import { Injectable, Logger } from "@nestjs/common";
import OpenAI from "openai";
import { PrismaService } from "../prisma/prisma.service";
import { AnalysisCacheService } from "./analysis-cache.service";
import { AuditLogService } from "../privacy/audit-log.service";
import { ANALYSIS_SYSTEM_PROMPT } from "./analysis.prompt";
import type { AnalysisRequestDto, AnalysisResult } from "@memo/shared";

interface EventEntry {
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
  tags: string[];
}

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);
  private readonly openai: OpenAI;

  constructor(
    private prisma: PrismaService,
    private cache: AnalysisCacheService,
    private auditLog: AuditLogService,
  ) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async analyze(
    userId: string,
    dto: AnalysisRequestDto,
    ipAddress?: string,
  ): Promise<AnalysisResult> {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setHours(23, 59, 59, 999);
    const periodStart = new Date(now);
    periodStart.setDate(periodStart.getDate() - dto.period);
    periodStart.setHours(0, 0, 0, 0);

    // Check cache
    const cached = await this.cache.get(
      userId,
      periodStart,
      periodEnd,
      dto.focus,
    );
    if (cached) {
      this.logger.log(`Cache hit for user ${userId}, period ${dto.period}d`);
      return cached as AnalysisResult;
    }

    // Load events
    const events = await this.prisma.event.findMany({
      where: {
        userId,
        timestamp: { gte: periodStart, lte: periodEnd },
        ...(dto.focus ? { category: { in: dto.focus } } : {}),
      },
      orderBy: { timestamp: "asc" },
    });

    if (events.length === 0) {
      throw new NoDataError("No events found for the selected period");
    }

    // Transform events to spec format
    const entries: EventEntry[] = events.map((event) =>
      this.transformEvent(event),
    );

    // Build payload
    const payload = {
      locale: "ru",
      format: "json",
      period: {
        start: periodStart.toISOString(),
        end: periodEnd.toISOString(),
      },
      focus: dto.focus,
      entries,
    };

    // Call OpenAI
    this.logger.log(
      `Calling OpenAI for user ${userId}: ${entries.length} events, ${dto.period}d`,
    );

    const completion = await this.openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(payload) },
      ],
      temperature: 0.3,
      timeout: 60000,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      throw new Error("Empty response from OpenAI");
    }

    const result = this.parseResponse(raw);

    // Cache result
    await this.cache.set(
      userId,
      periodStart,
      periodEnd,
      dto.focus,
      result as any,
    );

    // Audit log
    await this.auditLog.log({
      userId,
      action: "ai_analysis",
      resource: "analysis",
      details: { period: dto.period, focus: dto.focus, eventCount: entries.length },
      ipAddress,
    });

    return result;
  }

  private transformEvent(event: {
    category: string;
    timestamp: Date;
    details: any;
    note: string | null;
    rating: number | null;
  }): EventEntry {
    const details = (event.details as Record<string, unknown>) ?? {};
    const data: Record<string, unknown> = {};

    switch (event.category) {
      case "sleep":
        data.duration_hours = details.hours ?? null;
        data.quality = details.quality ?? null;
        break;
      case "meal":
        data.description = [details.mealType, details.items]
          .filter(Boolean)
          .join(": ") || event.note || "";
        data.rating = event.rating ?? null;
        break;
      case "mood":
        data.score = event.rating ?? (details.intensity ? (details.intensity as number) * 2 : null);
        if (event.note) data.note = event.note;
        break;
      case "symptom":
        data.type = details.symptom ?? "";
        data.severity = details.severity ?? event.rating ?? null;
        if (details.location) data.location = details.location;
        break;
      case "medication":
        data.name = details.name ?? "";
        data.dose = details.dose ?? "";
        break;
      case "exercise":
        data.type = details.type ?? "";
        data.duration_min = details.duration ?? null;
        data.intensity = details.intensity ?? null;
        break;
      case "water":
        data.amount_ml = this.parseWaterAmount(details.amount as string);
        if (event.note) data.note = event.note;
        break;
      case "stool":
        data.bristol_type = details.bristolScale ?? null;
        break;
      case "note":
        data.text = event.note ?? "";
        break;
    }

    const tags: string[] = [];
    // Extract meaningful tags from details
    if (details.mealType) tags.push(details.mealType as string);
    if (details.emotion) tags.push(details.emotion as string);
    if (details.intensity) tags.push(`intensity_${details.intensity}`);

    return {
      type: event.category,
      timestamp: event.timestamp.toISOString(),
      data,
      tags,
    };
  }

  private parseWaterAmount(amount?: string): number | null {
    if (!amount) return null;
    const match = amount.match(/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  private parseResponse(raw: string): AnalysisResult {
    let text = raw.trim();

    // Strip code fences if present
    if (text.startsWith("```")) {
      text = text.split("\n", 1)[1] ?? text;
      if (text.endsWith("```")) {
        text = text.slice(0, -3);
      }
      text = text.trim();
    }

    const result = JSON.parse(text);

    if (!result.analysis) {
      throw new Error("Invalid AI response: missing 'analysis' key");
    }
    if (!result.analysis.correlations) {
      throw new Error("Invalid AI response: missing 'correlations'");
    }

    return result as AnalysisResult;
  }
}

export class NoDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoDataError";
  }
}
```

**Step 2: Commit**

```bash
git add packages/api/src/analysis/analysis.service.ts
git commit -m "feat: add AnalysisService with OpenAI integration and event transformation"
```

---

### Task 7: Backend — AnalysisController

**Files:**
- Create: `packages/api/src/analysis/analysis.controller.ts`

**Step 1: Create `packages/api/src/analysis/analysis.controller.ts`**

```typescript
import {
  Controller,
  Post,
  Body,
  Req,
  UseGuards,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/user.decorator";
import { ZodPipe } from "../common/zod.pipe";
import { ConsentService } from "../privacy/consent.service";
import { AnalysisService, NoDataError } from "./analysis.service";
import { analysisRequestDto } from "@memo/shared";

@Controller("analysis")
@UseGuards(JwtAuthGuard)
export class AnalysisController {
  constructor(
    private analysisService: AnalysisService,
    private consentService: ConsentService,
  ) {}

  @Post()
  async analyze(
    @CurrentUser("id") userId: string,
    @Body(new ZodPipe(analysisRequestDto)) body: unknown,
    @Req() req: Request,
  ) {
    // Check ai_data_sharing consent
    const consents = await this.consentService.getCurrentConsents(userId);
    const aiConsent = consents.find((c) => c.type === "ai_data_sharing");
    if (!aiConsent || !aiConsent.granted) {
      throw new ForbiddenException({
        error: "AI_CONSENT_REQUIRED",
        message:
          "You need to enable AI Data Analysis in Privacy Settings before using this feature.",
      });
    }

    try {
      return await this.analysisService.analyze(
        userId,
        body as any,
        req.ip,
      );
    } catch (err) {
      if (err instanceof NoDataError) {
        throw new BadRequestException({
          error: "NO_DATA",
          message: err.message,
        });
      }
      throw new InternalServerErrorException({
        error: "ANALYSIS_FAILED",
        message: "Failed to analyze data. Please try again later.",
      });
    }
  }
}
```

**Step 2: Commit**

```bash
git add packages/api/src/analysis/analysis.controller.ts
git commit -m "feat: add AnalysisController with consent check and error handling"
```

---

### Task 8: Backend — AnalysisModule + Wire Into AppModule

**Files:**
- Create: `packages/api/src/analysis/analysis.module.ts`
- Modify: `packages/api/src/app.module.ts`

**Step 1: Create `packages/api/src/analysis/analysis.module.ts`**

```typescript
import { Module } from "@nestjs/common";
import { AnalysisController } from "./analysis.controller";
import { AnalysisService } from "./analysis.service";
import { AnalysisCacheService } from "./analysis-cache.service";

@Module({
  controllers: [AnalysisController],
  providers: [AnalysisService, AnalysisCacheService],
  exports: [AnalysisCacheService],
})
export class AnalysisModule {}
```

**Step 2: Add AnalysisModule to `packages/api/src/app.module.ts`**

Add import at top:

```typescript
import { AnalysisModule } from "./analysis/analysis.module";
```

Add `AnalysisModule` to the imports array (after `PrivacyModule`):

```typescript
@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    EventsModule,
    UsersModule,
    PushModule,
    RemindersModule,
    PrivacyModule,
    AnalysisModule,
  ],
})
export class AppModule {}
```

**Step 3: Verify backend compiles**

Run: `pnpm --filter @memo/api build` (or `pnpm dev:api` briefly to check)
Expected: No compilation errors

**Step 4: Commit**

```bash
git add packages/api/src/analysis/analysis.module.ts packages/api/src/app.module.ts
git commit -m "feat: wire AnalysisModule into AppModule"
```

---

### Task 9: Backend — Cache Invalidation on Event Changes

**Files:**
- Modify: `packages/api/src/events/events.module.ts`
- Modify: `packages/api/src/events/events.service.ts`

**Step 1: Import AnalysisModule in EventsModule**

Update `packages/api/src/events/events.module.ts`:

```typescript
import { Module } from "@nestjs/common";
import { EventsController } from "./events.controller";
import { EventsService } from "./events.service";
import { ExportService } from "./export.service";
import { AnalysisModule } from "../analysis/analysis.module";

@Module({
  imports: [AnalysisModule],
  controllers: [EventsController],
  providers: [EventsService, ExportService],
})
export class EventsModule {}
```

**Step 2: Inject AnalysisCacheService into EventsService**

In `packages/api/src/events/events.service.ts`:

Add import at top:

```typescript
import { AnalysisCacheService } from "../analysis/analysis-cache.service";
```

Update constructor:

```typescript
constructor(
  private prisma: PrismaService,
  private analysisCache: AnalysisCacheService,
) {}
```

Add cache invalidation to `create`, `update`, and `remove` methods. After each successful DB operation, call:

```typescript
await this.analysisCache.invalidate(userId);
```

Specifically:

In `create` method — after `this.prisma.event.create(...)`:

```typescript
async create(userId: string, dto: CreateEventDto) {
  const event = await this.prisma.event.create({
    data: {
      userId,
      category: dto.category,
      details: (dto.details as Prisma.InputJsonValue) ?? undefined,
      note: dto.note,
      rating: dto.rating,
      timestamp: dto.timestamp ? new Date(dto.timestamp) : new Date(),
    },
  });
  await this.analysisCache.invalidate(userId);
  return event;
}
```

In `update` method — after `this.prisma.event.update(...)`:

```typescript
async update(userId: string, id: string, dto: UpdateEventDto) {
  const event = await this.findOne(userId, id);
  const updated = await this.prisma.event.update({
    where: { id: event.id },
    data: {
      details: dto.details !== undefined ? (dto.details as Prisma.InputJsonValue) : undefined,
      note: dto.note !== undefined ? dto.note : undefined,
      rating: dto.rating !== undefined ? dto.rating : undefined,
      timestamp: dto.timestamp ? new Date(dto.timestamp) : undefined,
    },
  });
  await this.analysisCache.invalidate(userId);
  return updated;
}
```

In `remove` method — after `this.prisma.event.delete(...)`:

```typescript
async remove(userId: string, id: string) {
  const event = await this.findOne(userId, id);
  await this.prisma.event.delete({ where: { id: event.id } });
  await this.analysisCache.invalidate(userId);
  return { deleted: true };
}
```

**Step 3: Verify backend compiles**

Run: `pnpm --filter @memo/api build`
Expected: No compilation errors

**Step 4: Commit**

```bash
git add packages/api/src/events/events.module.ts packages/api/src/events/events.service.ts
git commit -m "feat: invalidate AI analysis cache on event changes"
```

---

### Task 10: Frontend — useAnalysis Hook

**Files:**
- Create: `packages/web/src/hooks/useAnalysis.ts`

**Step 1: Create `packages/web/src/hooks/useAnalysis.ts`**

```typescript
import { useState, useCallback } from "react";
import { api, ApiError } from "../api/client";
import type { AnalysisResult } from "@memo/shared";

type AnalysisError =
  | { type: "consent_required" }
  | { type: "no_data"; message: string }
  | { type: "error"; message: string };

export function useAnalysis() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AnalysisError | null>(null);

  const analyze = useCallback(
    async (period: 7 | 14 | 30, focus: string[] | null = null) => {
      setLoading(true);
      setError(null);
      setResult(null);

      try {
        const data = await api<AnalysisResult>("/analysis", {
          method: "POST",
          body: JSON.stringify({ period, focus }),
        });
        setResult(data);
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 403) {
            setError({ type: "consent_required" });
          } else if (err.status === 400) {
            setError({ type: "no_data", message: err.message });
          } else {
            setError({ type: "error", message: err.message });
          }
        } else {
          setError({
            type: "error",
            message: "An unexpected error occurred",
          });
        }
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, loading, error, analyze, reset };
}
```

**Step 2: Commit**

```bash
git add packages/web/src/hooks/useAnalysis.ts
git commit -m "feat: add useAnalysis hook for AI analytics API"
```

---

### Task 11: Frontend — Analysis UI Components

**Files:**
- Create: `packages/web/src/components/analysis/HealthScoreCard.tsx`
- Create: `packages/web/src/components/analysis/CorrelationCard.tsx`
- Create: `packages/web/src/components/analysis/TrendCard.tsx`
- Create: `packages/web/src/components/analysis/RecommendationCard.tsx`
- Create: `packages/web/src/components/analysis/AnomalyCard.tsx`
- Create: `packages/web/src/components/analysis/DataGapCard.tsx`
- Create: `packages/web/src/components/analysis/ConsentRequired.tsx`

**Step 1: Create `packages/web/src/components/analysis/HealthScoreCard.tsx`**

```typescript
import type { AnalysisHealthScore } from "@memo/shared";

const TREND_ICONS: Record<string, string> = {
  improving: "↑",
  stable: "→",
  declining: "↓",
};

const TREND_COLORS: Record<string, string> = {
  improving: "text-green-400",
  stable: "text-slate-400",
  declining: "text-red-400",
};

function scoreColor(value: number): string {
  if (value >= 70) return "#10B981";
  if (value >= 40) return "#F59E0B";
  return "#EF4444";
}

const COMPONENT_LABELS: Array<{
  key: keyof AnalysisHealthScore["components"];
  icon: string;
  label: string;
}> = [
  { key: "sleep", icon: "😴", label: "Sleep" },
  { key: "nutrition", icon: "🍽️", label: "Nutrition" },
  { key: "activity", icon: "🏃", label: "Activity" },
  { key: "digestion", icon: "💊", label: "Digestion" },
  { key: "mood", icon: "😊", label: "Mood" },
];

export function HealthScoreCard({
  score,
}: {
  score: AnalysisHealthScore;
}) {
  const color = scoreColor(score.value);
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (score.value / 100) * circumference;

  return (
    <div className="bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50">
      <h3 className="text-sm font-semibold text-slate-300 mb-4">
        Health Score
      </h3>

      <div className="flex items-center gap-6">
        {/* Circular progress */}
        <div className="relative w-32 h-32 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-slate-700"
            />
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke={color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 1s ease" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-white">
              {score.value}
            </span>
            <span
              className={`text-sm font-medium ${TREND_COLORS[score.trend]}`}
            >
              {TREND_ICONS[score.trend]} {score.trend}
            </span>
          </div>
        </div>

        {/* Components */}
        <div className="flex-1 grid grid-cols-1 gap-2">
          {COMPONENT_LABELS.map(({ key, icon, label }) => {
            const val = score.components[key];
            return (
              <div key={key} className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  {icon} {label}
                </span>
                <span
                  className="text-xs font-semibold"
                  style={{ color: val > 0 ? scoreColor(val) : undefined }}
                >
                  {val > 0 ? `${val}` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Create `packages/web/src/components/analysis/CorrelationCard.tsx`**

```typescript
import type { AnalysisCorrelation } from "@memo/shared";

const STRENGTH_COLORS: Record<string, string> = {
  strong: "bg-indigo-500/20 text-indigo-300",
  moderate: "bg-amber-500/20 text-amber-300",
  weak: "bg-slate-500/20 text-slate-400",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-green-400",
  medium: "text-amber-400",
  low: "text-slate-500",
};

export function CorrelationCard({
  correlation,
}: {
  correlation: AnalysisCorrelation;
}) {
  const isPositive = correlation.direction === "positive";

  return (
    <div
      className={`bg-slate-800/50 rounded-xl p-4 border ${
        isPositive ? "border-green-500/20" : "border-red-500/20"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span
            className={`text-lg ${isPositive ? "text-green-400" : "text-red-400"}`}
          >
            {isPositive ? "↗" : "↘"}
          </span>
          <span className="text-sm font-medium text-white">
            {correlation.factor_a.category} → {correlation.factor_b.category}
          </span>
        </div>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
            STRENGTH_COLORS[correlation.strength]
          }`}
        >
          {correlation.strength}
        </span>
      </div>

      <p className="text-xs text-slate-300 mb-2">
        {correlation.description}
      </p>

      {correlation.example && (
        <p className="text-[11px] text-slate-500 italic mb-2">
          {correlation.example}
        </p>
      )}

      <div className="flex items-center gap-3 text-[10px]">
        <span className={CONFIDENCE_COLORS[correlation.confidence]}>
          {correlation.confidence} confidence
        </span>
        <span className="text-slate-600">
          {correlation.data_points} data points
        </span>
      </div>
    </div>
  );
}
```

**Step 3: Create `packages/web/src/components/analysis/TrendCard.tsx`**

```typescript
import type { AnalysisTrend } from "@memo/shared";

const DIRECTION_ICONS: Record<string, { icon: string; color: string }> = {
  improving: { icon: "📈", color: "text-green-400" },
  declining: { icon: "📉", color: "text-red-400" },
  stable: { icon: "➡️", color: "text-slate-400" },
  cyclical: { icon: "🔄", color: "text-amber-400" },
};

export function TrendCard({ trend }: { trend: AnalysisTrend }) {
  const dir = DIRECTION_ICONS[trend.direction] ?? DIRECTION_ICONS.stable;

  return (
    <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span>{dir.icon}</span>
          <span className="text-sm font-medium text-white capitalize">
            {trend.category}: {trend.metric}
          </span>
        </div>
        <span className={`text-xs font-semibold ${dir.color}`}>
          {trend.direction}
        </span>
      </div>

      <p className="text-xs text-slate-300 mb-3">{trend.description}</p>

      {/* Mini data points */}
      {trend.data_points.length > 0 && (
        <div className="flex items-end gap-1 h-8">
          {trend.data_points.map((dp, i) => {
            const max = Math.max(...trend.data_points.map((d) => d.value));
            const height = max > 0 ? (dp.value / max) * 100 : 0;
            return (
              <div
                key={i}
                className="flex-1 rounded-sm bg-indigo-500/30"
                style={{ height: `${Math.max(height, 10)}%` }}
                title={`${dp.date}: ${dp.value}`}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
```

**Step 4: Create `packages/web/src/components/analysis/RecommendationCard.tsx`**

```typescript
import type { AnalysisRecommendation } from "@memo/shared";

const PRIORITY_STYLES: Record<string, string> = {
  high: "border-indigo-500/40 bg-indigo-500/5",
  medium: "border-amber-500/30 bg-amber-500/5",
  low: "border-slate-700/50 bg-slate-800/50",
};

const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-indigo-500/20 text-indigo-300",
  medium: "bg-amber-500/20 text-amber-300",
  low: "bg-slate-500/20 text-slate-400",
};

export function RecommendationCard({
  recommendation,
}: {
  recommendation: AnalysisRecommendation;
}) {
  return (
    <div
      className={`rounded-xl p-4 border ${
        PRIORITY_STYLES[recommendation.priority]
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-sm font-medium text-white">
          {recommendation.title}
        </span>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${
            PRIORITY_BADGE[recommendation.priority]
          }`}
        >
          {recommendation.priority}
        </span>
      </div>

      <p className="text-xs text-slate-300">{recommendation.description}</p>
    </div>
  );
}
```

**Step 5: Create `packages/web/src/components/analysis/AnomalyCard.tsx`**

```typescript
import type { AnalysisAnomaly } from "@memo/shared";

const SEVERITY_STYLES: Record<string, { border: string; badge: string }> = {
  alert: {
    border: "border-red-500/30",
    badge: "bg-red-500/20 text-red-300",
  },
  warning: {
    border: "border-amber-500/30",
    badge: "bg-amber-500/20 text-amber-300",
  },
  info: {
    border: "border-slate-700/50",
    badge: "bg-slate-500/20 text-slate-400",
  },
};

export function AnomalyCard({ anomaly }: { anomaly: AnalysisAnomaly }) {
  const style = SEVERITY_STYLES[anomaly.severity] ?? SEVERITY_STYLES.info;

  return (
    <div className={`bg-slate-800/50 rounded-xl p-4 border ${style.border}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-sm font-medium text-white">
          ⚠️ {anomaly.category}
        </span>
        <span
          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${style.badge}`}
        >
          {anomaly.severity}
        </span>
      </div>

      <p className="text-xs text-slate-300 mb-2">{anomaly.description}</p>

      <p className="text-[11px] text-slate-500">
        {new Date(anomaly.date).toLocaleDateString()}
      </p>
    </div>
  );
}
```

**Step 6: Create `packages/web/src/components/analysis/DataGapCard.tsx`**

```typescript
import type { AnalysisDataGap } from "@memo/shared";

const ISSUE_ICONS: Record<string, string> = {
  missing: "❌",
  insufficient: "📊",
  irregular: "🔀",
};

export function DataGapCard({ gap }: { gap: AnalysisDataGap }) {
  return (
    <div className="bg-slate-800/30 rounded-xl p-4 border border-slate-700/30">
      <div className="flex items-center gap-2 mb-1">
        <span>{ISSUE_ICONS[gap.issue] ?? "📝"}</span>
        <span className="text-xs font-medium text-slate-400 capitalize">
          {gap.category}
        </span>
        <span className="text-[10px] text-slate-600 px-1.5 py-0.5 rounded bg-slate-800">
          {gap.issue}
        </span>
      </div>
      <p className="text-xs text-slate-500">{gap.suggestion}</p>
    </div>
  );
}
```

**Step 7: Create `packages/web/src/components/analysis/ConsentRequired.tsx`**

```typescript
import { useNavigate } from "react-router-dom";
import { Sparkles, Shield } from "lucide-react";

export function ConsentRequired() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <div className="w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4">
        <Sparkles className="w-8 h-8 text-indigo-400" />
      </div>

      <h2 className="text-lg font-semibold text-white mb-2">
        Enable AI Analysis
      </h2>

      <p className="text-sm text-slate-400 max-w-xs mb-6">
        To use AI-powered health analysis, you need to enable data sharing
        in your privacy settings. Your data is sent to OpenAI for analysis
        and is not stored by the AI provider.
      </p>

      <button
        onClick={() => navigate("/settings/privacy")}
        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl px-6 py-3 transition-colors"
      >
        <Shield className="w-4 h-4" />
        Open Privacy Settings
      </button>
    </div>
  );
}
```

**Step 8: Commit**

```bash
git add packages/web/src/components/analysis/
git commit -m "feat: add AI analysis UI components (HealthScore, Correlation, Trend, Recommendation, Anomaly, DataGap, ConsentRequired)"
```

---

### Task 12: Frontend — AnalysisPage

**Files:**
- Create: `packages/web/src/pages/AnalysisPage.tsx`

**Step 1: Create `packages/web/src/pages/AnalysisPage.tsx`**

```typescript
import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { useAnalysis } from "../hooks/useAnalysis";
import { HealthScoreCard } from "../components/analysis/HealthScoreCard";
import { CorrelationCard } from "../components/analysis/CorrelationCard";
import { TrendCard } from "../components/analysis/TrendCard";
import { RecommendationCard } from "../components/analysis/RecommendationCard";
import { AnomalyCard } from "../components/analysis/AnomalyCard";
import { DataGapCard } from "../components/analysis/DataGapCard";
import { ConsentRequired } from "../components/analysis/ConsentRequired";

const PERIODS = [7, 14, 30] as const;

export function AnalysisPage() {
  const [period, setPeriod] = useState<7 | 14 | 30>(7);
  const { result, loading, error, analyze } = useAnalysis();

  const handleAnalyze = () => {
    analyze(period);
  };

  // Consent required
  if (error?.type === "consent_required") {
    return (
      <div className="px-4 pt-6 pb-6">
        <ConsentRequired />
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          <h1 className="text-xl font-bold text-white">AI Analysis</h1>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-2 mb-4">
          {PERIODS.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                period === p
                  ? "bg-indigo-600 text-white"
                  : "bg-slate-800 text-slate-400 hover:text-slate-300"
              }`}
            >
              {p}d
            </button>
          ))}
        </div>

        {/* Analyze button */}
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="w-full py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-60"
          style={{
            background: loading
              ? undefined
              : "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
            backgroundColor: loading ? "#374151" : undefined,
          }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Analyzing your health data...
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4" />
              Analyze
            </span>
          )}
        </button>
      </div>

      {/* Error states */}
      {error?.type === "no_data" && (
        <div className="text-center py-12">
          <p className="text-slate-400 text-sm mb-2">Not enough data</p>
          <p className="text-slate-500 text-xs">
            {error.message}
          </p>
        </div>
      )}

      {error?.type === "error" && (
        <div className="text-center py-12">
          <p className="text-red-400 text-sm mb-3">{error.message}</p>
          <button
            onClick={handleAnalyze}
            className="text-sm text-indigo-400 hover:text-indigo-300"
          >
            Try again
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-4 animate-pulse">
          <div className="bg-slate-800/50 rounded-2xl h-44 border border-slate-700/50" />
          <div className="bg-slate-800/50 rounded-xl h-20 border border-slate-700/50" />
          <div className="bg-slate-800/50 rounded-xl h-24 border border-slate-700/50" />
          <div className="bg-slate-800/50 rounded-xl h-24 border border-slate-700/50" />
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-6">
          {/* Health Score */}
          <HealthScoreCard score={result.analysis.health_score} />

          {/* Summary */}
          <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
            <p className="text-sm text-slate-300 leading-relaxed">
              {result.analysis.summary}
            </p>
          </div>

          {/* Correlations */}
          {result.analysis.correlations.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-300 mb-3">
                🔗 Correlations
              </h2>
              <div className="space-y-3">
                {result.analysis.correlations.map((c) => (
                  <CorrelationCard key={c.id} correlation={c} />
                ))}
              </div>
            </section>
          )}

          {/* Trends */}
          {result.analysis.trends.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-300 mb-3">
                📈 Trends
              </h2>
              <div className="space-y-3">
                {result.analysis.trends.map((t) => (
                  <TrendCard key={t.id} trend={t} />
                ))}
              </div>
            </section>
          )}

          {/* Anomalies */}
          {result.analysis.anomalies.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-300 mb-3">
                ⚠️ Anomalies
              </h2>
              <div className="space-y-3">
                {result.analysis.anomalies.map((a) => (
                  <AnomalyCard key={a.id} anomaly={a} />
                ))}
              </div>
            </section>
          )}

          {/* Recommendations */}
          {result.analysis.recommendations.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-300 mb-3">
                💡 Recommendations
              </h2>
              <div className="space-y-3">
                {result.analysis.recommendations.map((r) => (
                  <RecommendationCard key={r.id} recommendation={r} />
                ))}
              </div>
            </section>
          )}

          {/* Data Gaps */}
          {result.analysis.data_gaps.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-slate-300 mb-3">
                📝 Data Quality Notes
              </h2>
              <div className="space-y-2">
                {result.analysis.data_gaps.map((g, i) => (
                  <DataGapCard key={i} gap={g} />
                ))}
              </div>
            </section>
          )}

          {/* Period info */}
          <p className="text-[11px] text-slate-600 text-center">
            {result.analysis.period.start.split("T")[0]} —{" "}
            {result.analysis.period.end.split("T")[0]} (
            {result.analysis.period.total_days} days)
          </p>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add packages/web/src/pages/AnalysisPage.tsx
git commit -m "feat: add AnalysisPage with dashboard layout and all sections"
```

---

### Task 13: Frontend — AiFab Component

**Files:**
- Create: `packages/web/src/components/layout/AiFab.tsx`

**Step 1: Create `packages/web/src/components/layout/AiFab.tsx`**

```typescript
import { useNavigate, useLocation } from "react-router-dom";
import { Sparkles } from "lucide-react";

export function AiFab() {
  const navigate = useNavigate();
  const location = useLocation();

  // Don't show on the AI page itself
  if (location.pathname === "/ai") return null;

  return (
    <button
      onClick={() => navigate("/ai")}
      className="fixed bottom-6 right-6 z-20 w-14 h-14 rounded-full flex items-center justify-center text-white shadow-lg transition-transform active:scale-95"
      style={{
        background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
        boxShadow:
          "0 0 20px rgba(139, 92, 246, 0.4), 0 4px 12px rgba(0, 0, 0, 0.3)",
      }}
      aria-label="AI Analysis"
    >
      <Sparkles className="w-6 h-6" />
      {/* Pulsing glow ring */}
      <span
        className="absolute inset-0 rounded-full animate-ping"
        style={{
          background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)",
          opacity: 0.2,
          animationDuration: "2s",
        }}
      />
    </button>
  );
}
```

**Step 2: Commit**

```bash
git add packages/web/src/components/layout/AiFab.tsx
git commit -m "feat: add AiFab floating action button component"
```

---

### Task 14: Frontend — Wire Everything Together

**Files:**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/components/layout/AppLayout.tsx`
- Modify: `packages/web/src/components/layout/Sidebar.tsx`
- Modify: `packages/web/src/pages/PrivacySettingsPage.tsx`

**Step 1: Add /ai route in `packages/web/src/App.tsx`**

Add import at top:

```typescript
import { AnalysisPage } from "./pages/AnalysisPage";
```

Add route inside the authenticated Routes block, after the `/journal` route:

```typescript
<Route path="/ai" element={<AnalysisPage />} />
```

**Step 2: Add AiFab in `packages/web/src/components/layout/AppLayout.tsx`**

Add import:

```typescript
import { AiFab } from "./AiFab";
```

Add `<AiFab />` inside the layout, after `<main>`:

```typescript
export function AppLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader onMenuClick={() => setSidebarOpen(true)} />
      <Sidebar open={sidebarOpen} onOpenChange={setSidebarOpen} />
      <main className="flex-1 pt-14">{children}</main>
      <AiFab />
    </div>
  );
}
```

**Step 3: Add AI Analysis to Sidebar**

In `packages/web/src/components/layout/Sidebar.tsx`:

Add `Sparkles` to the lucide-react import:

```typescript
import {
  CalendarDays,
  List,
  Sparkles,
  Bell,
  Shield,
  User,
  LogOut,
} from "lucide-react";
```

Add AI item to NAV_ITEMS array (after the Events item):

```typescript
const NAV_ITEMS = [
  { to: "/", icon: CalendarDays, label: "Today" },
  { to: "/journal", icon: List, label: "Events" },
  { to: "/ai", icon: Sparkles, label: "AI Analysis" },
];
```

**Step 4: Add AI consent toggle to PrivacySettingsPage**

In `packages/web/src/pages/PrivacySettingsPage.tsx`, add a new `ConsentToggle` inside the "Consent Management" section, after the "Do Not Sell" toggle:

```typescript
          <ConsentToggle
            label="AI Data Analysis"
            description="Allow your health data to be sent to OpenAI for AI-powered analysis. Data is not stored by the AI provider."
            checked={getConsentGranted("ai_data_sharing")}
            onChange={(v) => handleToggleConsent("ai_data_sharing", v)}
          />
```

**Step 5: Verify frontend compiles**

Run: `pnpm dev:web` briefly to check
Expected: No compilation errors, FAB visible, /ai route works

**Step 6: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/components/layout/AppLayout.tsx packages/web/src/components/layout/Sidebar.tsx packages/web/src/pages/PrivacySettingsPage.tsx
git commit -m "feat: wire AI analysis into app routes, sidebar, layout FAB, and privacy settings"
```

---

### Task 15: Manual End-to-End Testing

**Step 1: Start the app**

Run: `pnpm dev`
Expected: Both API (port 3000) and web (port 5173) running

**Step 2: Test GDPR flow**

1. Log in to the app
2. Verify FAB button appears (bottom-right, purple gradient, pulsing glow)
3. Click FAB → navigate to /ai
4. Click "Analyze" → should show "consent_required" state
5. Click "Open Privacy Settings" → navigate to /settings/privacy
6. Enable "AI Data Analysis" toggle → toast "Consent granted"
7. Navigate back to /ai

**Step 3: Test analysis**

1. On /ai page, select period (7d)
2. Click "Analyze"
3. Verify loading state appears (skeleton + spinner)
4. Wait for response (~5-15 seconds)
5. Verify all sections render: Health Score, Summary, Correlations, Trends, Recommendations, Data Gaps

**Step 4: Test cache**

1. Click "Analyze" again with same period
2. Should return nearly instantly (cached)
3. Add a new event on HomePage
4. Return to /ai and analyze again → should take ~5-15 seconds (cache invalidated)

**Step 5: Test sidebar**

1. Open sidebar (hamburger menu)
2. Verify "AI Analysis" item with Sparkles icon appears between "Events" and divider
3. Click it → navigates to /ai
