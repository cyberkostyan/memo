# GDPR & CCPA Compliance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add full GDPR + CCPA compliance to Memo health tracking app — consent management, audit logging, data export, account deletion, privacy policies, and data retention.

**Architecture:** Dedicated `PrivacyModule` in NestJS backend with consent, audit-log, and deletion services. New frontend pages for privacy settings and policies. Consent banner on first visit. Registration flow updated with explicit health data consent.

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL 16, React 19, Zod, Tailwind CSS 4, Vaul (drawer), pnpm monorepo.

**Design doc:** `docs/plans/2026-02-20-gdpr-ccpa-compliance-design.md`

**Note:** No test framework exists yet. Steps include manual verification. Testing setup should be added as a separate task.

---

## Task 1: Prisma Schema — Add Consent, AuditLog, DataDeletionRequest Tables

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add Consent model to Prisma schema**

Add after the `PushSubscription` model in `prisma/schema.prisma`:

```prisma
model Consent {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      String   // "health_data_processing", "marketing", "analytics", "ccpa_do_not_sell"
  version   String   // policy version e.g. "1.0"
  granted   Boolean
  ipAddress String?
  userAgent String?
  createdAt DateTime @default(now())

  @@index([userId, type])
}
```

**Step 2: Add AuditLog model**

Add after Consent model:

```prisma
model AuditLog {
  id        String   @id @default(uuid())
  userId    String?
  targetId  String?
  action    String
  resource  String
  details   Json?
  ipAddress String?
  createdAt DateTime @default(now())

  @@index([userId, createdAt])
  @@index([targetId, action])
}
```

**Step 3: Add DataDeletionRequest model**

Add after AuditLog model:

```prisma
model DataDeletionRequest {
  id          String    @id @default(uuid())
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  status      String    @default("pending") // "pending", "completed", "cancelled"
  reason      String?
  scheduledAt DateTime
  completedAt DateTime?
  createdAt   DateTime  @default(now())

  @@index([status, scheduledAt])
}
```

**Step 4: Update User model relations**

Add to the `User` model in `prisma/schema.prisma`, after existing relations:

```prisma
  consents              Consent[]
  dataDeletionRequests  DataDeletionRequest[]
```

**Step 5: Generate and run migration**

```bash
cd /Users/cyber_kostyan/git/AI/memo
pnpm prisma migrate dev --name add_privacy_tables
```

Expected: Migration created successfully, 3 new tables in database.

**Step 6: Verify Prisma client generated**

```bash
pnpm prisma generate
```

**Step 7: Commit**

```bash
git add prisma/
git commit -m "Add Consent, AuditLog, DataDeletionRequest tables for GDPR"
```

---

## Task 2: Shared DTOs — Privacy Zod Schemas

**Files:**
- Create: `packages/shared/src/dto/privacy.dto.ts`
- Modify: `packages/shared/src/dto/index.ts` (add re-export)
- Modify: `packages/shared/src/dto/index.ts` (add `registerDto` consent field)

**Step 1: Create privacy DTO file**

Create `packages/shared/src/dto/privacy.dto.ts`:

```typescript
import { z } from "zod";

// Consent types
export const CONSENT_TYPES = [
  "health_data_processing",
  "marketing",
  "analytics",
  "ccpa_do_not_sell",
] as const;

export type ConsentType = (typeof CONSENT_TYPES)[number];

// Grant/withdraw consent
export const updateConsentDto = z.object({
  type: z.enum(CONSENT_TYPES),
  granted: z.boolean(),
});

// Delete account request
export const deleteAccountDto = z.object({
  password: z.string().min(1),
  reason: z.string().max(500).optional(),
});

// Cancel deletion
export const cancelDeletionDto = z.object({});

// Inferred types
export type UpdateConsentDto = z.infer<typeof updateConsentDto>;
export type DeleteAccountDto = z.infer<typeof deleteAccountDto>;

// Response types
export interface ConsentResponse {
  id: string;
  type: string;
  version: string;
  granted: boolean;
  createdAt: string;
}

export interface ConsentHistoryResponse {
  data: ConsentResponse[];
  total: number;
}

export interface DeletionRequestResponse {
  id: string;
  status: string;
  reason: string | null;
  scheduledAt: string;
  createdAt: string;
}

export interface DataExportResponse {
  exportDate: string;
  user: {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
  };
  events: Array<{
    category: string;
    details: Record<string, unknown> | null;
    note: string | null;
    rating: number | null;
    timestamp: string;
  }>;
  reminders: Array<{
    type: string;
    label: string;
    category: string | null;
    scheduleType: string | null;
    time: string | null;
    enabled: boolean;
    createdAt: string;
  }>;
  consents: Array<{
    type: string;
    granted: boolean;
    version: string;
    createdAt: string;
  }>;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  resource: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditLogResponse {
  data: AuditLogEntry[];
  total: number;
}
```

**Step 2: Export from DTO index**

Add to `packages/shared/src/dto/index.ts` at the end, before the type exports section:

```typescript
// Privacy DTOs
export {
  CONSENT_TYPES,
  type ConsentType,
  updateConsentDto,
  deleteAccountDto,
  cancelDeletionDto,
  type UpdateConsentDto,
  type DeleteAccountDto,
  type ConsentResponse,
  type ConsentHistoryResponse,
  type DeletionRequestResponse,
  type DataExportResponse,
  type AuditLogEntry,
  type AuditLogResponse,
} from "./privacy.dto";
```

**Step 3: Add consentToHealthData field to registerDto**

In `packages/shared/src/dto/index.ts`, update `registerDto`:

```typescript
export const registerDto = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().optional(),
  consentToHealthData: z.boolean().refine((v) => v === true, {
    message: "Consent to health data processing is required",
  }),
});
```

And update the `RegisterDto` type (it's auto-inferred, so no change needed).

**Step 4: Build shared package to verify**

```bash
cd /Users/cyber_kostyan/git/AI/memo
pnpm --filter @memo/shared build
```

Expected: Build succeeds without errors.

**Step 5: Commit**

```bash
git add packages/shared/
git commit -m "Add privacy Zod DTOs and consent field to register"
```

---

## Task 3: Backend — Audit Log Service & Interceptor

**Files:**
- Create: `packages/api/src/privacy/audit-log.service.ts`
- Create: `packages/api/src/privacy/audit-log.interceptor.ts`

**Step 1: Create audit log service**

Create `packages/api/src/privacy/audit-log.service.ts`:

```typescript
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuditLogService {
  constructor(private prisma: PrismaService) {}

  async log(params: {
    userId?: string;
    targetId?: string;
    action: string;
    resource: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
  }) {
    return this.prisma.auditLog.create({ data: params });
  }

  async findByUser(
    targetId: string,
    limit = 50,
    offset = 0,
  ) {
    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { targetId },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          action: true,
          resource: true,
          details: true,
          createdAt: true,
        },
      }),
      this.prisma.auditLog.count({ where: { targetId } }),
    ]);
    return { data, total };
  }

  async cleanup(olderThanYears: number) {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - olderThanYears);
    return this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
  }
}
```

**Step 2: Create audit log interceptor**

Create `packages/api/src/privacy/audit-log.interceptor.ts`:

```typescript
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { AuditLogService } from "./audit-log.service";

const AUDITED_ROUTES = new Map<string, string>([
  ["GET /users/me", "view_profile"],
  ["PATCH /users/me", "update_profile"],
  ["GET /events", "list_events"],
  ["POST /events", "create_event"],
  ["PATCH /events/:id", "update_event"],
  ["DELETE /events/:id", "delete_event"],
  ["GET /events/export", "export_events_xlsx"],
  ["GET /reminders", "list_reminders"],
  ["POST /reminders", "create_reminder"],
  ["PATCH /reminders/:id", "update_reminder"],
  ["DELETE /reminders/:id", "delete_reminder"],
  ["GET /privacy/export", "export_data"],
  ["POST /privacy/delete-request", "request_deletion"],
  ["DELETE /privacy/delete-request", "cancel_deletion"],
  ["POST /privacy/consents", "update_consent"],
]);

function matchRoute(method: string, url: string): string | undefined {
  const path = url.split("?")[0].replace(/\/api\//, "/");
  for (const [pattern, action] of AUDITED_ROUTES) {
    const [m, p] = pattern.split(" ");
    if (m !== method) continue;
    const regex = new RegExp(
      "^" + p.replace(/:[\w]+/g, "[\\w-]+") + "$",
    );
    if (regex.test(path)) return action;
  }
  return undefined;
}

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private auditLog: AuditLogService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const method = req.method;
    const url = req.url;
    const action = matchRoute(method, url);

    if (!action) return next.handle();

    const userId = req.user?.id;
    const resource = url.split("?")[0].split("/").filter(Boolean)[0] ?? "unknown";
    const ip = req.ip || req.headers["x-forwarded-for"];

    return next.handle().pipe(
      tap(() => {
        this.auditLog
          .log({
            userId,
            targetId: userId,
            action,
            resource,
            ipAddress: ip,
          })
          .catch(() => {}); // fire-and-forget, don't block response
      }),
    );
  }
}
```

**Step 3: Commit**

```bash
git add packages/api/src/privacy/
git commit -m "Add audit log service and interceptor"
```

---

## Task 4: Backend — Consent Service

**Files:**
- Create: `packages/api/src/privacy/consent.service.ts`

**Step 1: Create consent service**

Create `packages/api/src/privacy/consent.service.ts`:

```typescript
import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { UpdateConsentDto } from "@memo/shared";

const CURRENT_POLICY_VERSION = "1.0";

@Injectable()
export class ConsentService {
  constructor(private prisma: PrismaService) {}

  async getCurrentConsents(userId: string) {
    // Get latest consent for each type
    const consents = await this.prisma.$queryRaw<
      Array<{
        id: string;
        type: string;
        version: string;
        granted: boolean;
        createdAt: Date;
      }>
    >`
      SELECT DISTINCT ON (type) id, type, version, granted, "createdAt"
      FROM "Consent"
      WHERE "userId" = ${userId}
      ORDER BY type, "createdAt" DESC
    `;
    return consents;
  }

  async getConsentHistory(userId: string, limit = 50, offset = 0) {
    const [data, total] = await Promise.all([
      this.prisma.consent.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        select: {
          id: true,
          type: true,
          version: true,
          granted: true,
          createdAt: true,
        },
      }),
      this.prisma.consent.count({ where: { userId } }),
    ]);
    return { data, total };
  }

  async updateConsent(
    userId: string,
    dto: UpdateConsentDto,
    ipAddress?: string,
    userAgent?: string,
  ) {
    if (dto.type === "health_data_processing" && !dto.granted) {
      throw new BadRequestException(
        "Cannot withdraw health data processing consent. To stop processing, delete your account.",
      );
    }

    return this.prisma.consent.create({
      data: {
        userId,
        type: dto.type,
        version: CURRENT_POLICY_VERSION,
        granted: dto.granted,
        ipAddress,
        userAgent,
      },
    });
  }

  async createInitialConsent(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    return this.prisma.consent.create({
      data: {
        userId,
        type: "health_data_processing",
        version: CURRENT_POLICY_VERSION,
        granted: true,
        ipAddress,
        userAgent,
      },
    });
  }

  async cleanupOldWithdrawn(olderThanYears: number) {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - olderThanYears);
    return this.prisma.consent.deleteMany({
      where: {
        granted: false,
        createdAt: { lt: cutoff },
      },
    });
  }
}
```

**Step 2: Commit**

```bash
git add packages/api/src/privacy/consent.service.ts
git commit -m "Add consent service with CRUD and history"
```

---

## Task 5: Backend — Deletion Service

**Files:**
- Create: `packages/api/src/privacy/deletion.service.ts`

**Step 1: Create deletion service**

Create `packages/api/src/privacy/deletion.service.ts`:

```typescript
import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import * as bcrypt from "bcrypt";
import type { DeleteAccountDto } from "@memo/shared";

const GRACE_PERIOD_DAYS = 30;

@Injectable()
export class DeletionService {
  private readonly logger = new Logger(DeletionService.name);

  constructor(private prisma: PrismaService) {}

  async requestDeletion(userId: string, dto: DeleteAccountDto) {
    // Verify password
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new UnauthorizedException();

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException("Invalid password");

    // Check for existing pending request
    const existing = await this.prisma.dataDeletionRequest.findFirst({
      where: { userId, status: "pending" },
    });
    if (existing) {
      throw new BadRequestException("Deletion request already pending");
    }

    const scheduledAt = new Date();
    scheduledAt.setDate(scheduledAt.getDate() + GRACE_PERIOD_DAYS);

    return this.prisma.dataDeletionRequest.create({
      data: {
        userId,
        status: "pending",
        reason: dto.reason,
        scheduledAt,
      },
    });
  }

  async cancelDeletion(userId: string) {
    const request = await this.prisma.dataDeletionRequest.findFirst({
      where: { userId, status: "pending" },
    });
    if (!request) {
      throw new BadRequestException("No pending deletion request");
    }

    return this.prisma.dataDeletionRequest.update({
      where: { id: request.id },
      data: { status: "cancelled" },
    });
  }

  async getStatus(userId: string) {
    return this.prisma.dataDeletionRequest.findFirst({
      where: { userId, status: "pending" },
      select: {
        id: true,
        status: true,
        reason: true,
        scheduledAt: true,
        createdAt: true,
      },
    });
  }

  async executePendingDeletions() {
    const pendingRequests = await this.prisma.dataDeletionRequest.findMany({
      where: {
        status: "pending",
        scheduledAt: { lte: new Date() },
      },
    });

    for (const request of pendingRequests) {
      try {
        await this.prisma.$transaction(async (tx) => {
          // Delete user cascades all related data
          await tx.user.delete({ where: { id: request.userId } });
          await tx.dataDeletionRequest.update({
            where: { id: request.id },
            data: { status: "completed", completedAt: new Date() },
          });
        });
        this.logger.log(`Deleted account for user ${request.userId}`);
      } catch (err) {
        this.logger.error(
          `Failed to delete account for user ${request.userId}: ${err}`,
        );
      }
    }

    return pendingRequests.length;
  }

  async cleanupCompleted(olderThanYears: number) {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - olderThanYears);
    return this.prisma.dataDeletionRequest.deleteMany({
      where: {
        status: { in: ["completed", "cancelled"] },
        createdAt: { lt: cutoff },
      },
    });
  }
}
```

**Step 2: Commit**

```bash
git add packages/api/src/privacy/deletion.service.ts
git commit -m "Add deletion service with grace period and execution"
```

---

## Task 6: Backend — Privacy Service (Data Export)

**Files:**
- Create: `packages/api/src/privacy/privacy.service.ts`

**Step 1: Create privacy service**

Create `packages/api/src/privacy/privacy.service.ts`:

```typescript
import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { DataExportResponse } from "@memo/shared";

@Injectable()
export class PrivacyService {
  constructor(private prisma: PrismaService) {}

  async exportUserData(userId: string): Promise<DataExportResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    const [events, reminders, consents] = await Promise.all([
      this.prisma.event.findMany({
        where: { userId },
        orderBy: { timestamp: "desc" },
        select: {
          category: true,
          details: true,
          note: true,
          rating: true,
          timestamp: true,
        },
      }),
      this.prisma.reminder.findMany({
        where: { userId },
        select: {
          type: true,
          label: true,
          category: true,
          scheduleType: true,
          time: true,
          enabled: true,
          createdAt: true,
        },
      }),
      this.prisma.consent.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          type: true,
          granted: true,
          version: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      exportDate: new Date().toISOString(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt.toISOString(),
      },
      events: events.map((e) => ({
        ...e,
        details: e.details as Record<string, unknown> | null,
        timestamp: e.timestamp.toISOString(),
      })),
      reminders: reminders.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
      })),
      consents: consents.map((c) => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
      })),
    };
  }
}
```

**Step 2: Commit**

```bash
git add packages/api/src/privacy/privacy.service.ts
git commit -m "Add privacy service with JSON data export"
```

---

## Task 7: Backend — Privacy Controller

**Files:**
- Create: `packages/api/src/privacy/privacy.controller.ts`

**Step 1: Create privacy controller**

Create `packages/api/src/privacy/privacy.controller.ts`:

```typescript
import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Req,
  Res,
  UseGuards,
  Query,
} from "@nestjs/common";
import { Response, Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/user.decorator";
import { ZodPipe } from "../common/zod.pipe";
import { updateConsentDto, deleteAccountDto } from "@memo/shared";
import { PrivacyService } from "./privacy.service";
import { ConsentService } from "./consent.service";
import { DeletionService } from "./deletion.service";
import { AuditLogService } from "./audit-log.service";

@Controller("privacy")
@UseGuards(JwtAuthGuard)
export class PrivacyController {
  constructor(
    private privacy: PrivacyService,
    private consent: ConsentService,
    private deletion: DeletionService,
    private auditLog: AuditLogService,
  ) {}

  // --- Consents ---

  @Get("consents")
  getConsents(@CurrentUser("id") userId: string) {
    return this.consent.getCurrentConsents(userId);
  }

  @Post("consents")
  updateConsent(
    @CurrentUser("id") userId: string,
    @Body(new ZodPipe(updateConsentDto)) body: unknown,
    @Req() req: Request,
  ) {
    const dto = body as any;
    return this.consent.updateConsent(
      userId,
      dto,
      req.ip,
      req.headers["user-agent"],
    );
  }

  @Get("consents/history")
  getConsentHistory(
    @CurrentUser("id") userId: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.consent.getConsentHistory(
      userId,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }

  // --- Data Export ---

  @Get("export")
  async exportData(
    @CurrentUser("id") userId: string,
    @Res() res: Response,
  ) {
    const data = await this.privacy.exportUserData(userId);
    const date = new Date().toISOString().split("T")[0];
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="memo-data-export-${date}.json"`,
    );
    res.send(JSON.stringify(data, null, 2));
  }

  // --- Account Deletion ---

  @Post("delete-request")
  requestDeletion(
    @CurrentUser("id") userId: string,
    @Body(new ZodPipe(deleteAccountDto)) body: unknown,
  ) {
    return this.deletion.requestDeletion(userId, body as any);
  }

  @Delete("delete-request")
  cancelDeletion(@CurrentUser("id") userId: string) {
    return this.deletion.cancelDeletion(userId);
  }

  @Get("delete-request")
  getDeletionStatus(@CurrentUser("id") userId: string) {
    return this.deletion.getStatus(userId);
  }

  // --- Audit Log ---

  @Get("audit-log")
  getAuditLog(
    @CurrentUser("id") userId: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ) {
    return this.auditLog.findByUser(
      userId,
      limit ? parseInt(limit, 10) : 50,
      offset ? parseInt(offset, 10) : 0,
    );
  }
}
```

**Step 2: Commit**

```bash
git add packages/api/src/privacy/privacy.controller.ts
git commit -m "Add privacy controller with consents, export, deletion, audit endpoints"
```

---

## Task 8: Backend — Privacy Cron Jobs

**Files:**
- Create: `packages/api/src/privacy/privacy.cron.ts`

**Step 1: Create privacy cron service**

Create `packages/api/src/privacy/privacy.cron.ts`:

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DeletionService } from "./deletion.service";
import { AuditLogService } from "./audit-log.service";
import { ConsentService } from "./consent.service";

@Injectable()
export class PrivacyCronService {
  private readonly logger = new Logger(PrivacyCronService.name);

  constructor(
    private deletion: DeletionService,
    private auditLog: AuditLogService,
    private consent: ConsentService,
  ) {}

  // Execute pending account deletions — every hour
  @Cron(CronExpression.EVERY_HOUR)
  async executeDeletions() {
    const count = await this.deletion.executePendingDeletions();
    if (count > 0) {
      this.logger.log(`Executed ${count} pending account deletions`);
    }
  }

  // Cleanup old audit logs — daily at 3:00 AM
  @Cron("0 3 * * *")
  async cleanupAuditLogs() {
    const result = await this.auditLog.cleanup(2); // 2 years
    this.logger.log(`Cleaned up ${result.count} audit log entries`);
  }

  // Cleanup old withdrawn consents — daily at 3:30 AM
  @Cron("0 3 30 * *")
  async cleanupConsents() {
    const result = await this.consent.cleanupOldWithdrawn(5); // 5 years
    this.logger.log(`Cleaned up ${result.count} old consent records`);
  }

  // Cleanup completed/cancelled deletion requests — daily at 4:00 AM
  @Cron("0 4 * * *")
  async cleanupDeletionRequests() {
    const result = await this.deletion.cleanupCompleted(1); // 1 year
    this.logger.log(`Cleaned up ${result.count} old deletion requests`);
  }
}
```

**Step 2: Commit**

```bash
git add packages/api/src/privacy/privacy.cron.ts
git commit -m "Add privacy cron jobs for deletion execution and data retention"
```

---

## Task 9: Backend — Privacy Module + App Integration

**Files:**
- Create: `packages/api/src/privacy/privacy.module.ts`
- Modify: `packages/api/src/app.module.ts`

**Step 1: Create privacy module**

Create `packages/api/src/privacy/privacy.module.ts`:

```typescript
import { Module, Global } from "@nestjs/common";
import { PrivacyController } from "./privacy.controller";
import { PrivacyService } from "./privacy.service";
import { ConsentService } from "./consent.service";
import { AuditLogService } from "./audit-log.service";
import { DeletionService } from "./deletion.service";
import { PrivacyCronService } from "./privacy.cron";
import { AuditLogInterceptor } from "./audit-log.interceptor";

@Global()
@Module({
  controllers: [PrivacyController],
  providers: [
    PrivacyService,
    ConsentService,
    AuditLogService,
    DeletionService,
    PrivacyCronService,
    AuditLogInterceptor,
  ],
  exports: [ConsentService, AuditLogService],
})
export class PrivacyModule {}
```

**Step 2: Add PrivacyModule and AuditLogInterceptor to AppModule**

In `packages/api/src/app.module.ts`, add imports:

```typescript
import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { EventsModule } from "./events/events.module";
import { UsersModule } from "./users/users.module";
import { PushModule } from "./push/push.module";
import { RemindersModule } from "./reminders/reminders.module";
import { PrivacyModule } from "./privacy/privacy.module";
import { AuditLogInterceptor } from "./privacy/audit-log.interceptor";

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
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useExisting: AuditLogInterceptor,
    },
  ],
})
export class AppModule {}
```

**Step 3: Verify API compiles**

```bash
cd /Users/cyber_kostyan/git/AI/memo
pnpm --filter @memo/api build
```

Expected: Build succeeds.

**Step 4: Commit**

```bash
git add packages/api/src/privacy/privacy.module.ts packages/api/src/app.module.ts
git commit -m "Register PrivacyModule and AuditLogInterceptor in app"
```

---

## Task 10: Backend — Update Registration Flow for Consent

**Files:**
- Modify: `packages/api/src/auth/auth.service.ts`
- Modify: `packages/api/src/auth/auth.controller.ts`

**Step 1: Update AuthService.register to accept consent**

In `packages/api/src/auth/auth.service.ts`:

1. Add import: `import { ConsentService } from "../privacy/consent.service";`
2. Add to constructor: `private consentService: ConsentService`
3. Update `register` method to create initial consent after user creation:

```typescript
async register(
  dto: RegisterDto,
  ipAddress?: string,
  userAgent?: string,
): Promise<AuthTokens> {
  const existing = await this.prisma.user.findUnique({
    where: { email: dto.email },
  });
  if (existing) {
    throw new ConflictException("Email already registered");
  }

  const hash = await bcrypt.hash(dto.password, 10);
  const user = await this.prisma.user.create({
    data: { email: dto.email, password: hash, name: dto.name },
  });

  // Create initial health data processing consent
  await this.consentService.createInitialConsent(
    user.id,
    ipAddress,
    userAgent,
  );

  return this.generateTokens(user.id);
}
```

**Step 2: Update AuthController.register to pass request info**

In `packages/api/src/auth/auth.controller.ts`:

```typescript
@Post("register")
register(@Body(new ZodPipe(registerDto)) body: unknown, @Req() req: Request) {
  return this.auth.register(
    body as any,
    req.ip,
    req.headers["user-agent"],
  );
}
```

Add `import { Request } from "express";` and `import { Req } from "@nestjs/common";` to the imports.

**Step 3: Verify build**

```bash
pnpm --filter @memo/api build
```

**Step 4: Commit**

```bash
git add packages/api/src/auth/
git commit -m "Create health data consent on user registration"
```

---

## Task 11: Backend — Install and Configure Rate Limiting

**Files:**
- Modify: `packages/api/package.json`
- Modify: `packages/api/src/privacy/privacy.controller.ts`

**Step 1: Install throttler**

```bash
cd /Users/cyber_kostyan/git/AI/memo
pnpm --filter @memo/api add @nestjs/throttler
```

**Step 2: Add throttler to PrivacyModule imports**

In `packages/api/src/privacy/privacy.module.ts`, add:

```typescript
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
```

And update the module:

```typescript
@Global()
@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 3600000, // 1 hour in ms
      limit: 3,
    }]),
  ],
  controllers: [PrivacyController],
  // ... rest unchanged
})
```

**Step 3: Apply throttle to sensitive endpoints**

In `packages/api/src/privacy/privacy.controller.ts`, add `@Throttle` decorator to export and delete endpoints:

```typescript
import { Throttle } from "@nestjs/throttler";
```

Add `@Throttle({ default: { limit: 3, ttl: 3600000 } })` above `exportData()` and `requestDeletion()` methods.

**Step 4: Verify build**

```bash
pnpm --filter @memo/api build
```

**Step 5: Commit**

```bash
git add packages/api/
git commit -m "Add rate limiting to privacy export and deletion endpoints"
```

---

## Task 12: Frontend — Privacy API Hooks

**Files:**
- Create: `packages/web/src/hooks/useConsent.ts`
- Create: `packages/web/src/hooks/usePrivacy.ts`

**Step 1: Create consent hook**

Create `packages/web/src/hooks/useConsent.ts`:

```typescript
import { useState, useCallback } from "react";
import { api } from "../api/client";
import type { ConsentResponse, ConsentHistoryResponse } from "@memo/shared";

export function useConsent() {
  const [consents, setConsents] = useState<ConsentResponse[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchConsents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<ConsentResponse[]>("/privacy/consents");
      setConsents(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateConsent = useCallback(
    async (type: string, granted: boolean) => {
      const result = await api<ConsentResponse>("/privacy/consents", {
        method: "POST",
        body: JSON.stringify({ type, granted }),
      });
      setConsents((prev) =>
        prev.map((c) => (c.type === type ? result : c)),
      );
      return result;
    },
    [],
  );

  const fetchHistory = useCallback(async (limit = 50, offset = 0) => {
    return api<ConsentHistoryResponse>(
      `/privacy/consents/history?limit=${limit}&offset=${offset}`,
    );
  }, []);

  return { consents, loading, fetchConsents, updateConsent, fetchHistory };
}
```

**Step 2: Create privacy hook**

Create `packages/web/src/hooks/usePrivacy.ts`:

```typescript
import { useState, useCallback } from "react";
import { api, apiDownload } from "../api/client";
import type { DeletionRequestResponse, AuditLogResponse } from "@memo/shared";

export function usePrivacy() {
  const [deletionRequest, setDeletionRequest] =
    useState<DeletionRequestResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const exportData = useCallback(async () => {
    await apiDownload("/privacy/export");
  }, []);

  const requestDeletion = useCallback(
    async (password: string, reason?: string) => {
      const result = await api<DeletionRequestResponse>(
        "/privacy/delete-request",
        {
          method: "POST",
          body: JSON.stringify({ password, reason }),
        },
      );
      setDeletionRequest(result);
      return result;
    },
    [],
  );

  const cancelDeletion = useCallback(async () => {
    await api("/privacy/delete-request", { method: "DELETE" });
    setDeletionRequest(null);
  }, []);

  const fetchDeletionStatus = useCallback(async () => {
    setLoading(true);
    try {
      const result =
        await api<DeletionRequestResponse | null>("/privacy/delete-request");
      setDeletionRequest(result);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAuditLog = useCallback(async (limit = 50, offset = 0) => {
    return api<AuditLogResponse>(
      `/privacy/audit-log?limit=${limit}&offset=${offset}`,
    );
  }, []);

  return {
    deletionRequest,
    loading,
    exportData,
    requestDeletion,
    cancelDeletion,
    fetchDeletionStatus,
    fetchAuditLog,
  };
}
```

**Step 3: Commit**

```bash
git add packages/web/src/hooks/useConsent.ts packages/web/src/hooks/usePrivacy.ts
git commit -m "Add useConsent and usePrivacy frontend hooks"
```

---

## Task 13: Frontend — Privacy Settings Page

**Files:**
- Create: `packages/web/src/pages/PrivacySettingsPage.tsx`

**Step 1: Create Privacy Settings page**

Create `packages/web/src/pages/PrivacySettingsPage.tsx`:

```typescript
import { useState, useEffect, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useConsent } from "../hooks/useConsent";
import { usePrivacy } from "../hooks/usePrivacy";
import { ApiError } from "../api/client";

export function PrivacySettingsPage() {
  const {
    consents,
    loading: consentsLoading,
    fetchConsents,
    updateConsent,
  } = useConsent();
  const {
    deletionRequest,
    loading: privacyLoading,
    exportData,
    requestDeletion,
    cancelDeletion,
    fetchDeletionStatus,
  } = usePrivacy();

  const [exporting, setExporting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteReason, setDeleteReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchConsents();
    fetchDeletionStatus();
  }, [fetchConsents, fetchDeletionStatus]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportData();
      toast.success("Data exported successfully");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Export failed",
      );
    } finally {
      setExporting(false);
    }
  };

  const handleToggleConsent = async (type: string, granted: boolean) => {
    try {
      await updateConsent(type, granted);
      toast.success(`Consent ${granted ? "granted" : "withdrawn"}`);
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to update consent",
      );
    }
  };

  const handleDeleteRequest = async (e: FormEvent) => {
    e.preventDefault();
    setDeleting(true);
    try {
      await requestDeletion(deletePassword, deleteReason || undefined);
      setShowDeleteDialog(false);
      setDeletePassword("");
      setDeleteReason("");
      toast.success("Account deletion scheduled");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to request deletion",
      );
    } finally {
      setDeleting(false);
    }
  };

  const handleCancelDeletion = async () => {
    try {
      await cancelDeletion();
      toast.success("Deletion cancelled");
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : "Failed to cancel",
      );
    }
  };

  const getConsentGranted = (type: string) =>
    consents.find((c) => c.type === type)?.granted ?? false;

  const loading = consentsLoading || privacyLoading;

  if (loading) {
    return (
      <div className="px-4 pt-6 pb-20">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-20">
      <Link
        to="/profile"
        className="text-sm text-indigo-400 hover:text-indigo-300 mb-4 inline-block"
      >
        &larr; Back to Profile
      </Link>
      <h1 className="text-xl font-bold mb-6">Privacy & Data</h1>

      {/* Consent Management */}
      <section className="max-w-sm mb-8">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">
          Consent Management
        </h2>

        <div className="space-y-3">
          <ConsentToggle
            label="Health Data Processing"
            description="Required to use the app. Processing of your health and wellness data."
            checked={getConsentGranted("health_data_processing")}
            disabled
          />
          <ConsentToggle
            label="Marketing Communications"
            description="Receive updates and tips about health tracking."
            checked={getConsentGranted("marketing")}
            onChange={(v) => handleToggleConsent("marketing", v)}
          />
          <ConsentToggle
            label="Analytics"
            description="Help improve the app with anonymous usage data."
            checked={getConsentGranted("analytics")}
            onChange={(v) => handleToggleConsent("analytics", v)}
          />
          <ConsentToggle
            label="Do Not Sell My Data (CCPA)"
            description="Opt out of any future sale of personal information."
            checked={getConsentGranted("ccpa_do_not_sell")}
            onChange={(v) => handleToggleConsent("ccpa_do_not_sell", v)}
          />
        </div>
      </section>

      {/* Data Export */}
      <section className="max-w-sm mb-8 pt-6 border-t border-slate-800">
        <h2 className="text-sm font-semibold text-slate-300 mb-2">
          Export Your Data
        </h2>
        <p className="text-xs text-slate-500 mb-3">
          Download all your data in JSON format (GDPR Article 20).
        </p>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="w-full bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-medium rounded-lg py-3 transition-colors"
        >
          {exporting ? "Exporting..." : "Export My Data"}
        </button>
      </section>

      {/* Account Deletion */}
      <section className="max-w-sm mb-8 pt-6 border-t border-slate-800">
        <h2 className="text-sm font-semibold text-slate-300 mb-2">
          Delete Account
        </h2>

        {deletionRequest ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <p className="text-sm text-red-400 mb-2">
              Account deletion scheduled for{" "}
              <strong>
                {new Date(deletionRequest.scheduledAt).toLocaleDateString()}
              </strong>
            </p>
            <p className="text-xs text-slate-500 mb-3">
              Your data will be permanently deleted on this date. You can
              cancel anytime before then.
            </p>
            <button
              onClick={handleCancelDeletion}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-medium rounded-lg py-2 transition-colors text-sm"
            >
              Cancel Deletion
            </button>
          </div>
        ) : showDeleteDialog ? (
          <form
            onSubmit={handleDeleteRequest}
            className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 space-y-3"
          >
            <p className="text-xs text-slate-400">
              Your account and all data will be permanently deleted after a
              30-day grace period. Enter your password to confirm.
            </p>
            <input
              type="password"
              placeholder="Current password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-red-500 text-sm"
            />
            <input
              type="text"
              placeholder="Reason (optional)"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-slate-600 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteDialog(false)}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-white rounded-lg py-2 text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={deleting}
                className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-lg py-2 text-sm transition-colors"
              >
                {deleting ? "Requesting..." : "Delete Account"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <p className="text-xs text-slate-500 mb-3">
              Permanently delete your account and all associated data.
            </p>
            <button
              onClick={() => setShowDeleteDialog(true)}
              className="w-full bg-red-600/20 hover:bg-red-600/30 text-red-400 font-medium rounded-lg py-3 transition-colors border border-red-500/30"
            >
              Request Account Deletion
            </button>
          </>
        )}
      </section>

      {/* Legal Links */}
      <section className="max-w-sm pt-6 border-t border-slate-800">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">
          Legal
        </h2>
        <div className="space-y-2">
          <Link
            to="/privacy-policy"
            className="block text-sm text-indigo-400 hover:text-indigo-300"
          >
            Privacy Policy
          </Link>
          <Link
            to="/cookie-policy"
            className="block text-sm text-indigo-400 hover:text-indigo-300"
          >
            Cookie Policy
          </Link>
        </div>
      </section>
    </div>
  );
}

function ConsentToggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (value: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex-1">
        <p className="text-sm text-white">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none ${
          checked ? "bg-indigo-600" : "bg-slate-700"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transform transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add packages/web/src/pages/PrivacySettingsPage.tsx
git commit -m "Add Privacy Settings page with consents, export, and deletion"
```

---

## Task 14: Frontend — Privacy Policy Page

**Files:**
- Create: `packages/web/src/pages/PrivacyPolicyPage.tsx`

**Step 1: Create Privacy Policy page**

Create `packages/web/src/pages/PrivacyPolicyPage.tsx`:

```typescript
import { Link } from "react-router-dom";

export function PrivacyPolicyPage() {
  return (
    <div className="px-4 pt-6 pb-20 max-w-2xl mx-auto">
      <Link
        to="/profile"
        className="text-sm text-indigo-400 hover:text-indigo-300 mb-4 inline-block"
      >
        &larr; Back
      </Link>
      <h1 className="text-xl font-bold mb-6">Privacy Policy</h1>
      <div className="prose prose-invert prose-sm max-w-none text-slate-300 space-y-4">
        <p className="text-xs text-slate-500">Last updated: February 20, 2026</p>

        <h2 className="text-lg font-semibold text-white mt-6">1. Who We Are</h2>
        <p>
          Memo is a self-hosted health and wellness tracking application. We act as the
          data controller for your personal data under GDPR (EU General Data Protection
          Regulation) and CCPA (California Consumer Privacy Act).
        </p>

        <h2 className="text-lg font-semibold text-white mt-6">2. Data We Collect</h2>
        <p>We collect the following personal data:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Account data:</strong> email address, name (optional), encrypted password</li>
          <li><strong>Health data (special category):</strong> meal logs, stool tracking,
            mood, symptoms, medications, exercise, water intake, sleep, and notes</li>
          <li><strong>Reminder settings:</strong> notification preferences and schedules</li>
          <li><strong>Technical data:</strong> push notification endpoints, consent records, access logs</li>
        </ul>

        <h2 className="text-lg font-semibold text-white mt-6">3. Legal Basis (GDPR Article 6 & 9)</h2>
        <p>
          We process your data based on your <strong>explicit consent</strong> (Article 9(2)(a))
          for health data, and <strong>contract performance</strong> (Article 6(1)(b)) for
          providing the service.
        </p>

        <h2 className="text-lg font-semibold text-white mt-6">4. How We Use Your Data</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Provide the health tracking and journaling service</li>
          <li>Send reminders and notifications you configure</li>
          <li>Generate data exports you request</li>
          <li>Maintain security and prevent unauthorized access</li>
        </ul>

        <h2 className="text-lg font-semibold text-white mt-6">5. Data Sharing</h2>
        <p>
          We do <strong>not</strong> sell, rent, or share your personal data with third parties.
          All data is stored on our self-hosted infrastructure. No third-party data processors
          are used.
        </p>

        <h2 className="text-lg font-semibold text-white mt-6">6. Data Retention</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Health data:</strong> retained while your account is active</li>
          <li><strong>Audit logs:</strong> 2 years, then automatically deleted</li>
          <li><strong>Consent records:</strong> 5 years after withdrawal (legal requirement)</li>
          <li><strong>Inactive accounts:</strong> notified after 23 months, deleted after 24 months of inactivity</li>
        </ul>

        <h2 className="text-lg font-semibold text-white mt-6">7. Your Rights (GDPR)</h2>
        <p>Under GDPR, you have the right to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Access</strong> (Article 15): Export all your data in JSON format</li>
          <li><strong>Rectification</strong> (Article 16): Edit your profile and events</li>
          <li><strong>Erasure</strong> (Article 17): Request account deletion with 30-day grace period</li>
          <li><strong>Restrict processing</strong> (Article 18): Manage consents individually</li>
          <li><strong>Data portability</strong> (Article 20): Download data in machine-readable JSON</li>
          <li><strong>Withdraw consent</strong> (Article 7): At any time via Privacy Settings</li>
        </ul>
        <p>
          Exercise these rights in <Link to="/settings/privacy" className="text-indigo-400 hover:text-indigo-300">Privacy Settings</Link>.
        </p>

        <h2 className="text-lg font-semibold text-white mt-6">8. Your Rights (CCPA)</h2>
        <p>California residents additionally have the right to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>Know</strong> what data is collected (this policy)</li>
          <li><strong>Delete</strong> your data (via account deletion)</li>
          <li><strong>Opt-Out</strong> of sale of personal information (we do not sell data)</li>
          <li><strong>Non-Discrimination</strong> for exercising your rights</li>
        </ul>

        <h2 className="text-lg font-semibold text-white mt-6">9. Security</h2>
        <p>
          We implement the following security measures: encrypted passwords (bcrypt),
          short-lived access tokens (15 minutes), refresh token rotation, parameterized
          database queries, input validation, rate limiting on sensitive operations,
          and comprehensive audit logging.
        </p>

        <h2 className="text-lg font-semibold text-white mt-6">10. Changes to This Policy</h2>
        <p>
          We will notify you of material changes by requesting re-consent through the app.
          Continued use after notification constitutes acceptance.
        </p>

        <h2 className="text-lg font-semibold text-white mt-6">11. Contact</h2>
        <p>
          For privacy-related inquiries, contact the data controller at the email
          address provided in your deployment configuration.
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add packages/web/src/pages/PrivacyPolicyPage.tsx
git commit -m "Add Privacy Policy page with GDPR and CCPA sections"
```

---

## Task 15: Frontend — Cookie Policy Page

**Files:**
- Create: `packages/web/src/pages/CookiePolicyPage.tsx`

**Step 1: Create Cookie Policy page**

Create `packages/web/src/pages/CookiePolicyPage.tsx`:

```typescript
import { Link } from "react-router-dom";

export function CookiePolicyPage() {
  return (
    <div className="px-4 pt-6 pb-20 max-w-2xl mx-auto">
      <Link
        to="/profile"
        className="text-sm text-indigo-400 hover:text-indigo-300 mb-4 inline-block"
      >
        &larr; Back
      </Link>
      <h1 className="text-xl font-bold mb-6">Cookie & Storage Policy</h1>
      <div className="prose prose-invert prose-sm max-w-none text-slate-300 space-y-4">
        <p className="text-xs text-slate-500">Last updated: February 20, 2026</p>

        <h2 className="text-lg font-semibold text-white mt-6">What We Store</h2>
        <p>
          Memo does <strong>not</strong> use tracking cookies, analytics cookies, or
          advertising cookies. We use browser localStorage exclusively for authentication:
        </p>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-2 text-slate-300">Key</th>
              <th className="text-left py-2 text-slate-300">Purpose</th>
              <th className="text-left py-2 text-slate-300">Duration</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-800">
              <td className="py-2"><code className="text-indigo-400">accessToken</code></td>
              <td className="py-2">JWT for API authentication</td>
              <td className="py-2">15 minutes</td>
            </tr>
            <tr className="border-b border-slate-800">
              <td className="py-2"><code className="text-indigo-400">refreshToken</code></td>
              <td className="py-2">Token to obtain new access token</td>
              <td className="py-2">7 days</td>
            </tr>
          </tbody>
        </table>

        <h2 className="text-lg font-semibold text-white mt-6">Third-Party Cookies</h2>
        <p>None. We do not load any third-party scripts or trackers.</p>

        <h2 className="text-lg font-semibold text-white mt-6">How to Clear</h2>
        <p>
          Sign out of Memo to clear all stored tokens. You can also clear them
          manually via your browser's developer tools (Application &gt; Local Storage).
        </p>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add packages/web/src/pages/CookiePolicyPage.tsx
git commit -m "Add Cookie Policy page"
```

---

## Task 16: Frontend — Consent Banner Component

**Files:**
- Create: `packages/web/src/components/privacy/ConsentBanner.tsx`

**Step 1: Create consent banner**

Create `packages/web/src/components/privacy/ConsentBanner.tsx`:

```typescript
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

const CONSENT_BANNER_KEY = "memo_consent_banner_dismissed";
const CONSENT_BANNER_VERSION = "1.0";

export function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(CONSENT_BANNER_KEY);
    if (dismissed !== CONSENT_BANNER_VERSION) {
      setVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(CONSENT_BANNER_KEY, CONSENT_BANNER_VERSION);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-16 left-0 right-0 z-30 px-4 pb-2">
      <div className="max-w-sm mx-auto bg-slate-800 border border-slate-700 rounded-xl p-4 shadow-xl">
        <p className="text-sm text-slate-300 mb-3">
          We use localStorage for authentication only. No tracking cookies.
          Your health data is processed with your explicit consent.
        </p>
        <div className="flex gap-2">
          <Link
            to="/privacy-policy"
            className="flex-1 text-center bg-slate-700 hover:bg-slate-600 text-white text-sm rounded-lg py-2 transition-colors"
          >
            Read Policy
          </Link>
          <button
            onClick={handleAccept}
            className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg py-2 transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add packages/web/src/components/privacy/ConsentBanner.tsx
git commit -m "Add ConsentBanner component"
```

---

## Task 17: Frontend — Update Registration Page with Consent Checkbox

**Files:**
- Modify: `packages/web/src/auth/RegisterPage.tsx`

**Step 1: Add consent checkbox to registration form**

In `packages/web/src/auth/RegisterPage.tsx`:

1. Add state: `const [consentToHealthData, setConsentToHealthData] = useState(false);`
2. Update `handleSubmit` to pass consent: `await register(email, password, name || undefined, consentToHealthData);`
3. Add checkbox before submit button:

```tsx
<label className="flex items-start gap-2 cursor-pointer">
  <input
    type="checkbox"
    checked={consentToHealthData}
    onChange={(e) => setConsentToHealthData(e.target.checked)}
    className="mt-1 rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
  />
  <span className="text-xs text-slate-400">
    I consent to the processing of my health data as described in the{" "}
    <Link to="/privacy-policy" className="text-indigo-400 hover:text-indigo-300">
      Privacy Policy
    </Link>
    . This consent is required to use Memo.
  </span>
</label>
```

4. Disable submit button when consent not checked:

```tsx
disabled={loading || !consentToHealthData}
```

**Step 2: Update AuthContext register to accept consent**

In `packages/web/src/auth/AuthContext.tsx`:

1. Update register function signature: `register: (email: string, password: string, name?: string, consentToHealthData?: boolean) => Promise<void>;`
2. Update register implementation to pass `consentToHealthData: true` in body:

```typescript
const register = async (email: string, password: string, name?: string, consentToHealthData?: boolean) => {
  const tokens = await api<AuthTokens>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name, consentToHealthData: consentToHealthData ?? true }),
  });
  setTokens(tokens.accessToken, tokens.refreshToken);
  await fetchUser();
};
```

**Step 3: Commit**

```bash
git add packages/web/src/auth/
git commit -m "Add health data consent checkbox to registration flow"
```

---

## Task 18: Frontend — Router Updates & ProfilePage Integration

**Files:**
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/src/pages/ProfilePage.tsx`

**Step 1: Add new routes to App.tsx**

In `packages/web/src/App.tsx`:

1. Add imports:

```typescript
import { PrivacySettingsPage } from "./pages/PrivacySettingsPage";
import { PrivacyPolicyPage } from "./pages/PrivacyPolicyPage";
import { CookiePolicyPage } from "./pages/CookiePolicyPage";
import { ConsentBanner } from "./components/privacy/ConsentBanner";
```

2. Add routes inside the authenticated `<Routes>` block (before the `*` catch-all):

```tsx
<Route path="/settings/privacy" element={<PrivacySettingsPage />} />
<Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
<Route path="/cookie-policy" element={<CookiePolicyPage />} />
```

3. Also add `/privacy-policy` and `/cookie-policy` routes in the non-authenticated block (users should be able to read the policy before registering):

```tsx
<Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
<Route path="/cookie-policy" element={<CookiePolicyPage />} />
```

4. Add `<ConsentBanner />` inside the authenticated section, before `</div>`:

```tsx
<ConsentBanner />
```

**Step 2: Add Privacy & Data section to ProfilePage**

In `packages/web/src/pages/ProfilePage.tsx`, add a new section between the Reminders section and the "Member since" section:

```tsx
{/* Privacy & Data Section */}
<div className="mt-8 pt-6 border-t border-slate-800 max-w-sm">
  <h2 className="text-sm font-semibold text-slate-300 mb-3">Privacy & Data</h2>
  <Link
    to="/settings/privacy"
    className="flex items-center justify-between bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-3 hover:bg-slate-800 transition-colors"
  >
    <span className="text-sm text-white">Privacy Settings</span>
    <span className="text-slate-500">&rsaquo;</span>
  </Link>
</div>
```

Add `import { Link } from "react-router-dom";` to imports.

**Step 3: Verify frontend builds**

```bash
cd /Users/cyber_kostyan/git/AI/memo
pnpm --filter @memo/web build
```

Expected: Build succeeds.

**Step 4: Commit**

```bash
git add packages/web/src/App.tsx packages/web/src/pages/ProfilePage.tsx
git commit -m "Add privacy routes, consent banner, and ProfilePage link"
```

---

## Task 19: Full Build Verification

**Step 1: Build all packages**

```bash
cd /Users/cyber_kostyan/git/AI/memo
pnpm build
```

Expected: All 3 packages build successfully.

**Step 2: Run migration on dev database**

```bash
pnpm prisma migrate status
```

Expected: All migrations applied.

**Step 3: Start dev server and manually verify**

```bash
pnpm dev
```

Verify:
- [ ] Registration shows consent checkbox
- [ ] Cannot register without checkbox
- [ ] Profile page shows "Privacy & Data" section
- [ ] Privacy Settings page loads with consent toggles
- [ ] Export button downloads JSON
- [ ] Delete account flow shows password dialog
- [ ] Privacy Policy page renders
- [ ] Cookie Policy page renders
- [ ] Consent banner appears on first visit

**Step 4: Final commit**

```bash
git add -A
git commit -m "GDPR & CCPA compliance: final integration verification"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Prisma schema + migration | `prisma/schema.prisma` |
| 2 | Shared privacy DTOs | `packages/shared/src/dto/privacy.dto.ts` |
| 3 | Audit log service + interceptor | `packages/api/src/privacy/audit-log.*` |
| 4 | Consent service | `packages/api/src/privacy/consent.service.ts` |
| 5 | Deletion service | `packages/api/src/privacy/deletion.service.ts` |
| 6 | Privacy service (export) | `packages/api/src/privacy/privacy.service.ts` |
| 7 | Privacy controller | `packages/api/src/privacy/privacy.controller.ts` |
| 8 | Privacy cron jobs | `packages/api/src/privacy/privacy.cron.ts` |
| 9 | Privacy module + app integration | `privacy.module.ts`, `app.module.ts` |
| 10 | Registration consent flow | `auth.service.ts`, `auth.controller.ts` |
| 11 | Rate limiting | `@nestjs/throttler`, `privacy.controller.ts` |
| 12 | Frontend privacy hooks | `useConsent.ts`, `usePrivacy.ts` |
| 13 | Privacy Settings page | `PrivacySettingsPage.tsx` |
| 14 | Privacy Policy page | `PrivacyPolicyPage.tsx` |
| 15 | Cookie Policy page | `CookiePolicyPage.tsx` |
| 16 | Consent Banner | `ConsentBanner.tsx` |
| 17 | Registration consent checkbox | `RegisterPage.tsx`, `AuthContext.tsx` |
| 18 | Router + ProfilePage integration | `App.tsx`, `ProfilePage.tsx` |
| 19 | Full build verification | All packages |
