# Reminders Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add server-side push notification reminders (scheduled + inactivity-based) to the Memo health tracker, managed from the Profile page.

**Architecture:** NestJS cron job checks reminders every 60 seconds, sends Web Push via `web-push` library to Service Workers registered on user devices. Reminders stored in PostgreSQL via Prisma. Frontend registers Service Worker, manages push subscriptions, and provides CRUD UI for reminders on the Profile page.

**Tech Stack:** @nestjs/schedule (cron), web-push (VAPID push), Prisma (DB), Service Worker (notifications), React (UI)

---

### Task 1: Install backend dependencies

**Files:**
- Modify: `packages/api/package.json`
- Modify: `.env.example`

**Step 1: Install @nestjs/schedule and web-push**

Run: `pnpm --filter @memo/api add @nestjs/schedule web-push`
Run: `pnpm --filter @memo/api add -D @types/web-push`

**Step 2: Generate VAPID keys**

Run: `pnpm --filter @memo/api exec -- npx web-push generate-vapid-keys --json`

Save the output — you'll need `publicKey` and `privateKey`.

**Step 3: Update .env.example**

Add to `.env.example`:

```
VAPID_PUBLIC_KEY="paste-public-key-here"
VAPID_PRIVATE_KEY="paste-private-key-here"
VAPID_EMAIL="mailto:user@example.com"
```

Also add these keys with actual generated values to `.env`.

**Step 4: Commit**

```bash
git add packages/api/package.json pnpm-lock.yaml .env.example
git commit -m "Add @nestjs/schedule and web-push dependencies"
```

---

### Task 2: Add Reminder and PushSubscription models to Prisma

**Files:**
- Modify: `prisma/schema.prisma`

**Step 1: Add models to schema**

Add to `prisma/schema.prisma` after the Event model:

```prisma
model Reminder {
  id            String    @id @default(uuid())
  userId        String
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  type          String    // "scheduled" | "inactivity"
  label         String
  category      String?
  scheduleType  String?   // "daily" | "interval"
  time          String?   // "09:00"
  intervalMin   Int?
  inactivityMin Int?
  activeFrom    String    @default("08:00")
  activeTo      String    @default("22:00")
  enabled       Boolean   @default(true)
  timezone      String
  lastSentAt    DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([userId, enabled])
}

model PushSubscription {
  id        String   @id @default(uuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  endpoint  String   @unique
  p256dh    String
  auth      String
  createdAt DateTime @default(now())

  @@index([userId])
}
```

Also add relations to the User model (after existing relations):

```prisma
  reminders         Reminder[]
  pushSubscriptions PushSubscription[]
```

**Step 2: Create migration**

Run: `pnpm prisma:migrate` — name it `add_reminders_and_push_subscriptions`

**Step 3: Generate Prisma client**

Run: `pnpm prisma:generate`

**Step 4: Commit**

```bash
git add prisma/
git commit -m "Add Reminder and PushSubscription models"
```

---

### Task 3: Add reminder DTOs to shared package

**Files:**
- Modify: `packages/shared/src/dto/index.ts`

**Step 1: Add reminder DTOs**

In `packages/shared/src/dto/index.ts`, after the export DTOs section (line 49), add:

```typescript
// Reminder DTOs
export const createReminderDto = z.object({
  type: z.enum(["scheduled", "inactivity"]),
  label: z.string().min(1).max(100),
  category: z.enum(EVENT_CATEGORIES).optional(),
  scheduleType: z.enum(["daily", "interval"]).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(), // "HH:MM"
  intervalMin: z.number().int().min(15).max(1440).optional(),
  inactivityMin: z.number().int().min(30).max(1440).optional(),
  activeFrom: z.string().regex(/^\d{2}:\d{2}$/).default("08:00"),
  activeTo: z.string().regex(/^\d{2}:\d{2}$/).default("22:00"),
  timezone: z.string(),
});

export const updateReminderDto = z.object({
  label: z.string().min(1).max(100).optional(),
  scheduleType: z.enum(["daily", "interval"]).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  intervalMin: z.number().int().min(15).max(1440).optional(),
  inactivityMin: z.number().int().min(30).max(1440).optional(),
  activeFrom: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  activeTo: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  enabled: z.boolean().optional(),
});

export const pushSubscriptionDto = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});
```

**Step 2: Add inferred types**

After the existing type exports, add:

```typescript
export type CreateReminderDto = z.infer<typeof createReminderDto>;
export type UpdateReminderDto = z.infer<typeof updateReminderDto>;
export type PushSubscriptionDto = z.infer<typeof pushSubscriptionDto>;
```

**Step 3: Add response types**

After existing response interfaces, add:

```typescript
export interface ReminderResponse {
  id: string;
  type: string;
  label: string;
  category: string | null;
  scheduleType: string | null;
  time: string | null;
  intervalMin: number | null;
  inactivityMin: number | null;
  activeFrom: string;
  activeTo: string;
  enabled: boolean;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}
```

**Step 4: Build shared package**

Run: `pnpm --filter @memo/shared build`

**Step 5: Commit**

```bash
git add packages/shared/src/dto/index.ts
git commit -m "Add reminder and push subscription DTOs"
```

---

### Task 4: Create PushService and PushController

**Files:**
- Create: `packages/api/src/push/push.service.ts`
- Create: `packages/api/src/push/push.controller.ts`
- Create: `packages/api/src/push/push.module.ts`

**Step 1: Create PushService**

Create `packages/api/src/push/push.service.ts`:

```typescript
import { Injectable, Logger } from "@nestjs/common";
import * as webPush from "web-push";
import { PrismaService } from "../prisma/prisma.service";
import type { PushSubscriptionDto } from "@memo/shared";

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private prisma: PrismaService) {
    webPush.setVapidDetails(
      process.env.VAPID_EMAIL || "mailto:test@example.com",
      process.env.VAPID_PUBLIC_KEY || "",
      process.env.VAPID_PRIVATE_KEY || "",
    );
  }

  async subscribe(userId: string, dto: PushSubscriptionDto) {
    return this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: {
        userId,
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
      update: {
        userId,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
    });
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
    return { deleted: true };
  }

  async sendToUser(userId: string, payload: { title: string; body: string }) {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });

    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        webPush
          .sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify(payload),
          )
          .catch(async (err) => {
            if (err.statusCode === 404 || err.statusCode === 410) {
              await this.prisma.pushSubscription.delete({
                where: { id: sub.id },
              });
              this.logger.warn(`Removed expired subscription ${sub.id}`);
            }
            throw err;
          }),
      ),
    );

    const sent = results.filter((r) => r.status === "fulfilled").length;
    this.logger.debug(`Push sent to ${sent}/${subscriptions.length} subscriptions for user ${userId}`);
  }
}
```

**Step 2: Create PushController**

Create `packages/api/src/push/push.controller.ts`:

```typescript
import { Controller, Post, Delete, Body, UseGuards } from "@nestjs/common";
import { PushService } from "./push.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/user.decorator";
import { ZodPipe } from "../common/zod.pipe";
import { pushSubscriptionDto } from "@memo/shared";

@Controller("push")
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private push: PushService) {}

  @Post("subscribe")
  subscribe(
    @CurrentUser("id") userId: string,
    @Body(new ZodPipe(pushSubscriptionDto)) body: unknown,
  ) {
    return this.push.subscribe(userId, body as any);
  }

  @Delete("subscribe")
  unsubscribe(
    @CurrentUser("id") userId: string,
    @Body() body: { endpoint: string },
  ) {
    return this.push.unsubscribe(userId, body.endpoint);
  }
}
```

**Step 3: Create PushModule**

Create `packages/api/src/push/push.module.ts`:

```typescript
import { Module, Global } from "@nestjs/common";
import { PushController } from "./push.controller";
import { PushService } from "./push.service";

@Global()
@Module({
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
```

**Step 4: Verify TypeScript compiles**

Run: `pnpm --filter @memo/shared build && pnpm --filter @memo/api exec -- tsc --noEmit`

**Step 5: Commit**

```bash
git add packages/api/src/push/
git commit -m "Add PushService and PushController for Web Push"
```

---

### Task 5: Create RemindersService and RemindersController

**Files:**
- Create: `packages/api/src/reminders/reminders.service.ts`
- Create: `packages/api/src/reminders/reminders.controller.ts`
- Create: `packages/api/src/reminders/reminders.module.ts`

**Step 1: Create RemindersService**

Create `packages/api/src/reminders/reminders.service.ts`:

```typescript
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateReminderDto, UpdateReminderDto } from "@memo/shared";

@Injectable()
export class RemindersService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateReminderDto) {
    return this.prisma.reminder.create({
      data: {
        userId,
        type: dto.type,
        label: dto.label,
        category: dto.category,
        scheduleType: dto.scheduleType,
        time: dto.time,
        intervalMin: dto.intervalMin,
        inactivityMin: dto.inactivityMin,
        activeFrom: dto.activeFrom,
        activeTo: dto.activeTo,
        timezone: dto.timezone,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.reminder.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
  }

  async findOne(userId: string, id: string) {
    const reminder = await this.prisma.reminder.findUnique({ where: { id } });
    if (!reminder) throw new NotFoundException("Reminder not found");
    if (reminder.userId !== userId) throw new ForbiddenException();
    return reminder;
  }

  async update(userId: string, id: string, dto: UpdateReminderDto) {
    const reminder = await this.findOne(userId, id);
    return this.prisma.reminder.update({
      where: { id: reminder.id },
      data: {
        label: dto.label,
        scheduleType: dto.scheduleType,
        time: dto.time,
        intervalMin: dto.intervalMin,
        inactivityMin: dto.inactivityMin,
        activeFrom: dto.activeFrom,
        activeTo: dto.activeTo,
        enabled: dto.enabled,
      },
    });
  }

  async remove(userId: string, id: string) {
    const reminder = await this.findOne(userId, id);
    await this.prisma.reminder.delete({ where: { id: reminder.id } });
    return { deleted: true };
  }
}
```

**Step 2: Create RemindersController**

Create `packages/api/src/reminders/reminders.controller.ts`:

```typescript
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from "@nestjs/common";
import { RemindersService } from "./reminders.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CurrentUser } from "../common/user.decorator";
import { ZodPipe } from "../common/zod.pipe";
import { createReminderDto, updateReminderDto } from "@memo/shared";

@Controller("reminders")
@UseGuards(JwtAuthGuard)
export class RemindersController {
  constructor(private reminders: RemindersService) {}

  @Post()
  create(
    @CurrentUser("id") userId: string,
    @Body(new ZodPipe(createReminderDto)) body: unknown,
  ) {
    return this.reminders.create(userId, body as any);
  }

  @Get()
  findAll(@CurrentUser("id") userId: string) {
    return this.reminders.findAll(userId);
  }

  @Patch(":id")
  update(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body(new ZodPipe(updateReminderDto)) body: unknown,
  ) {
    return this.reminders.update(userId, id, body as any);
  }

  @Delete(":id")
  remove(@CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.reminders.remove(userId, id);
  }
}
```

**Step 3: Create RemindersModule**

Create `packages/api/src/reminders/reminders.module.ts`:

```typescript
import { Module } from "@nestjs/common";
import { RemindersController } from "./reminders.controller";
import { RemindersService } from "./reminders.service";

@Module({
  controllers: [RemindersController],
  providers: [RemindersService],
  exports: [RemindersService],
})
export class RemindersModule {}
```

**Step 4: Verify TypeScript compiles**

Run: `pnpm --filter @memo/api exec -- tsc --noEmit`

**Step 5: Commit**

```bash
git add packages/api/src/reminders/
git commit -m "Add RemindersService and RemindersController"
```

---

### Task 6: Create ReminderCronService

The core logic: every 60 seconds, check which reminders need to fire and send push notifications.

**Files:**
- Create: `packages/api/src/reminders/reminder-cron.service.ts`

**Step 1: Create ReminderCronService**

Create `packages/api/src/reminders/reminder-cron.service.ts`:

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { PushService } from "../push/push.service";
import { CATEGORY_CONFIG } from "@memo/shared";

@Injectable()
export class ReminderCronService {
  private readonly logger = new Logger(ReminderCronService.name);

  constructor(
    private prisma: PrismaService,
    private push: PushService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async checkReminders() {
    const reminders = await this.prisma.reminder.findMany({
      where: { enabled: true },
      include: { user: { include: { pushSubscriptions: true } } },
    });

    for (const reminder of reminders) {
      if (reminder.user.pushSubscriptions.length === 0) continue;

      try {
        const shouldFire = await this.shouldFire(reminder);
        if (shouldFire) {
          const icon = reminder.category
            ? (CATEGORY_CONFIG as any)[reminder.category]?.icon ?? ""
            : "";
          await this.push.sendToUser(reminder.userId, {
            title: `${icon} ${reminder.label}`.trim(),
            body: this.buildBody(reminder),
          });
          await this.prisma.reminder.update({
            where: { id: reminder.id },
            data: { lastSentAt: new Date() },
          });
          this.logger.debug(`Fired reminder "${reminder.label}" for user ${reminder.userId}`);
        }
      } catch (err) {
        this.logger.error(`Error processing reminder ${reminder.id}: ${err}`);
      }
    }
  }

  private async shouldFire(reminder: any): Promise<boolean> {
    const now = this.getNowInTimezone(reminder.timezone);
    const currentTime = this.formatTime(now);

    // Check active window
    if (!this.isInActiveWindow(currentTime, reminder.activeFrom, reminder.activeTo)) {
      return false;
    }

    if (reminder.type === "scheduled") {
      return this.shouldFireScheduled(reminder, now, currentTime);
    }

    if (reminder.type === "inactivity") {
      return this.shouldFireInactivity(reminder, now);
    }

    return false;
  }

  private shouldFireScheduled(reminder: any, now: Date, currentTime: string): boolean {
    if (reminder.scheduleType === "daily") {
      // Fire if current HH:MM matches and haven't sent today
      if (currentTime !== reminder.time) return false;
      if (reminder.lastSentAt) {
        const lastSentLocal = this.toTimezone(reminder.lastSentAt, reminder.timezone);
        if (this.isSameDay(lastSentLocal, now)) return false;
      }
      return true;
    }

    if (reminder.scheduleType === "interval") {
      if (!reminder.lastSentAt) return true;
      const elapsedMin = (Date.now() - reminder.lastSentAt.getTime()) / 60_000;
      return elapsedMin >= reminder.intervalMin;
    }

    return false;
  }

  private async shouldFireInactivity(reminder: any, now: Date): Promise<boolean> {
    if (!reminder.category || !reminder.inactivityMin) return false;

    // Don't fire too often
    if (reminder.lastSentAt) {
      const elapsedSinceLastSend = (Date.now() - reminder.lastSentAt.getTime()) / 60_000;
      if (elapsedSinceLastSend < reminder.inactivityMin) return false;
    }

    const lastEvent = await this.prisma.event.findFirst({
      where: { userId: reminder.userId, category: reminder.category },
      orderBy: { timestamp: "desc" },
    });

    if (!lastEvent) return true; // Never logged this category

    const elapsedMin = (Date.now() - lastEvent.timestamp.getTime()) / 60_000;
    return elapsedMin >= reminder.inactivityMin;
  }

  private getNowInTimezone(tz: string): Date {
    const str = new Date().toLocaleString("en-US", { timeZone: tz });
    return new Date(str);
  }

  private toTimezone(date: Date, tz: string): Date {
    const str = date.toLocaleString("en-US", { timeZone: tz });
    return new Date(str);
  }

  private formatTime(date: Date): string {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  private isSameDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  private isInActiveWindow(current: string, from: string, to: string): boolean {
    return current >= from && current <= to;
  }

  private buildBody(reminder: any): string {
    if (reminder.type === "inactivity") {
      const hours = Math.round((reminder.inactivityMin ?? 60) / 60);
      return `No ${reminder.category} logged in the last ${hours}h`;
    }
    if (reminder.scheduleType === "interval") {
      return `Time for your ${reminder.intervalMin}-minute check-in`;
    }
    return "Time for your reminder";
  }
}
```

**Step 2: Register CronService in RemindersModule**

Update `packages/api/src/reminders/reminders.module.ts`:

```typescript
import { Module } from "@nestjs/common";
import { RemindersController } from "./reminders.controller";
import { RemindersService } from "./reminders.service";
import { ReminderCronService } from "./reminder-cron.service";

@Module({
  controllers: [RemindersController],
  providers: [RemindersService, ReminderCronService],
  exports: [RemindersService],
})
export class RemindersModule {}
```

**Step 3: Verify TypeScript compiles**

Run: `pnpm --filter @memo/api exec -- tsc --noEmit`

**Step 4: Commit**

```bash
git add packages/api/src/reminders/
git commit -m "Add ReminderCronService for scheduled push notifications"
```

---

### Task 7: Register modules in AppModule

**Files:**
- Modify: `packages/api/src/app.module.ts`

**Step 1: Update AppModule**

Replace `packages/api/src/app.module.ts`:

```typescript
import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { EventsModule } from "./events/events.module";
import { UsersModule } from "./users/users.module";
import { PushModule } from "./push/push.module";
import { RemindersModule } from "./reminders/reminders.module";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    EventsModule,
    UsersModule,
    PushModule,
    RemindersModule,
  ],
})
export class AppModule {}
```

**Step 2: Full build check**

Run: `pnpm --filter @memo/shared build && pnpm --filter @memo/api exec -- tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/api/src/app.module.ts
git commit -m "Register PushModule, RemindersModule, and ScheduleModule"
```

---

### Task 8: Create Service Worker

**Files:**
- Create: `packages/web/public/sw.js`

**Step 1: Create Service Worker**

Create `packages/web/public/sw.js`:

```javascript
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Memo", {
      body: data.body ?? "",
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      data: { url: "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    }),
  );
});
```

**Step 2: Commit**

```bash
git add packages/web/public/sw.js
git commit -m "Add Service Worker for push notification handling"
```

---

### Task 9: Create usePushSubscription hook

**Files:**
- Create: `packages/web/src/hooks/usePushSubscription.ts`

**Step 1: Create the hook**

Create `packages/web/src/hooks/usePushSubscription.ts`:

```typescript
import { useState, useCallback, useEffect } from "react";
import { api } from "../api/client";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushSubscription() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default",
  );
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if already subscribed
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setSubscribed(!!sub);
        });
      });
    }
  }, []);

  const subscribe = useCallback(async () => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      alert("Push notifications are not supported in this browser.");
      return false;
    }

    setLoading(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return false;

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const json = subscription.toJSON();
      await api("/push/subscribe", {
        method: "POST",
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: {
            p256dh: json.keys?.p256dh,
            auth: json.keys?.auth,
          },
        }),
      });

      setSubscribed(true);
      return true;
    } catch (err) {
      console.error("Push subscription failed:", err);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { permission, subscribed, loading, subscribe };
}
```

**Step 2: Add VITE_VAPID_PUBLIC_KEY to .env.example**

Add to `.env.example`:

```
VITE_VAPID_PUBLIC_KEY="paste-public-key-here"
```

Also add the actual public key to `packages/web/.env` (or root `.env` if Vite picks it up).

**Step 3: Verify TypeScript compiles**

Run: `pnpm --filter @memo/web exec -- tsc --noEmit`

**Step 4: Commit**

```bash
git add packages/web/src/hooks/usePushSubscription.ts .env.example
git commit -m "Add usePushSubscription hook for push registration"
```

---

### Task 10: Create useReminders hook

**Files:**
- Create: `packages/web/src/hooks/useReminders.ts`

**Step 1: Create the hook**

Create `packages/web/src/hooks/useReminders.ts`:

```typescript
import { useState, useCallback } from "react";
import { api } from "../api/client";
import type { ReminderResponse, CreateReminderDto, UpdateReminderDto } from "@memo/shared";

export function useReminders() {
  const [reminders, setReminders] = useState<ReminderResponse[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReminders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<ReminderResponse[]>("/reminders");
      setReminders(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const createReminder = useCallback(async (dto: CreateReminderDto) => {
    const reminder = await api<ReminderResponse>("/reminders", {
      method: "POST",
      body: JSON.stringify(dto),
    });
    setReminders((prev) => [...prev, reminder]);
    return reminder;
  }, []);

  const updateReminder = useCallback(async (id: string, dto: UpdateReminderDto) => {
    const reminder = await api<ReminderResponse>(`/reminders/${id}`, {
      method: "PATCH",
      body: JSON.stringify(dto),
    });
    setReminders((prev) => prev.map((r) => (r.id === id ? reminder : r)));
    return reminder;
  }, []);

  const deleteReminder = useCallback(async (id: string) => {
    await api(`/reminders/${id}`, { method: "DELETE" });
    setReminders((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return { reminders, loading, fetchReminders, createReminder, updateReminder, deleteReminder };
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm --filter @memo/web exec -- tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/web/src/hooks/useReminders.ts
git commit -m "Add useReminders hook for reminder CRUD"
```

---

### Task 11: Create ReminderList component

**Files:**
- Create: `packages/web/src/components/reminders/ReminderList.tsx`

**Step 1: Create the component**

Create `packages/web/src/components/reminders/ReminderList.tsx`:

```tsx
import { useEffect } from "react";
import { CATEGORY_CONFIG, type EventCategory, type ReminderResponse } from "@memo/shared";
import { useReminders } from "../../hooks/useReminders";

interface Props {
  onAdd: () => void;
  onEdit: (reminder: ReminderResponse) => void;
}

export function ReminderList({ onAdd, onEdit }: Props) {
  const { reminders, loading, fetchReminders, updateReminder, deleteReminder } =
    useReminders();

  useEffect(() => {
    fetchReminders();
  }, [fetchReminders]);

  const toggleEnabled = async (reminder: ReminderResponse) => {
    await updateReminder(reminder.id, { enabled: !reminder.enabled });
  };

  const formatSchedule = (r: ReminderResponse): string => {
    if (r.type === "inactivity") {
      const hours = Math.round((r.inactivityMin ?? 60) / 60);
      return `inactivity · ${hours}h`;
    }
    if (r.scheduleType === "daily") return `daily · ${r.time}`;
    if (r.scheduleType === "interval") {
      const hours = Math.round((r.intervalMin ?? 60) / 60);
      return `interval · every ${hours}h`;
    }
    return "";
  };

  if (loading) {
    return <div className="text-sm text-slate-500 py-4">Loading...</div>;
  }

  return (
    <div>
      {reminders.length > 0 && (
        <div className="space-y-2 mb-3">
          {reminders.map((r) => {
            const icon = r.category
              ? CATEGORY_CONFIG[r.category as EventCategory]?.icon ?? ""
              : "";
            return (
              <div
                key={r.id}
                className="flex items-center justify-between bg-slate-800 rounded-lg px-4 py-3"
              >
                <button
                  onClick={() => onEdit(r)}
                  className="flex-1 text-left"
                >
                  <div className="text-sm font-medium text-white">
                    {icon} {r.label}
                  </div>
                  <div className="text-xs text-slate-400">
                    {formatSchedule(r)}
                  </div>
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleEnabled(r)}
                    className={`relative w-10 h-6 rounded-full transition-colors ${
                      r.enabled ? "bg-indigo-600" : "bg-slate-600"
                    }`}
                  >
                    <span
                      className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                        r.enabled ? "left-5" : "left-1"
                      }`}
                    />
                  </button>
                  <button
                    onClick={() => deleteReminder(r.id)}
                    className="text-slate-500 hover:text-red-400 text-sm"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={onAdd}
        className="w-full py-2 rounded-lg text-sm font-medium border border-dashed border-slate-600 text-slate-400 hover:text-white hover:border-slate-400 transition-colors"
      >
        + Add Reminder
      </button>
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm --filter @memo/web exec -- tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/web/src/components/reminders/ReminderList.tsx
git commit -m "Add ReminderList component with toggle and delete"
```

---

### Task 12: Create ReminderSheet component

Bottom sheet for creating/editing reminders with preset templates.

**Files:**
- Create: `packages/web/src/components/reminders/ReminderSheet.tsx`

**Step 1: Create the component**

Create `packages/web/src/components/reminders/ReminderSheet.tsx`:

```tsx
import { useState } from "react";
import { Drawer } from "vaul";
import {
  EVENT_CATEGORIES,
  CATEGORY_CONFIG,
  type EventCategory,
  type ReminderResponse,
  type CreateReminderDto,
} from "@memo/shared";
import { useReminders } from "../../hooks/useReminders";

interface Props {
  editingReminder: ReminderResponse | null;
  onClose: () => void;
  onSaved: () => void;
}

const PRESETS: Array<Omit<CreateReminderDto, "timezone">> = [
  { type: "inactivity", label: "Drink water", category: "water", inactivityMin: 120, activeFrom: "08:00", activeTo: "22:00" },
  { type: "scheduled", label: "Take medication", category: "medication", scheduleType: "daily", time: "09:00", activeFrom: "08:00", activeTo: "22:00" },
  { type: "inactivity", label: "Log meals", category: "meal", inactivityMin: 240, activeFrom: "08:00", activeTo: "22:00" },
  { type: "scheduled", label: "Track mood", category: "mood", scheduleType: "interval", intervalMin: 240, activeFrom: "08:00", activeTo: "22:00" },
];

export function ReminderSheet({ editingReminder, onClose, onSaved }: Props) {
  const { createReminder, updateReminder } = useReminders();

  const [type, setType] = useState<"scheduled" | "inactivity">(
    (editingReminder?.type as any) ?? "scheduled",
  );
  const [label, setLabel] = useState(editingReminder?.label ?? "");
  const [category, setCategory] = useState<string>(editingReminder?.category ?? "");
  const [scheduleType, setScheduleType] = useState<"daily" | "interval">(
    (editingReminder?.scheduleType as any) ?? "daily",
  );
  const [time, setTime] = useState(editingReminder?.time ?? "09:00");
  const [intervalMin, setIntervalMin] = useState(editingReminder?.intervalMin ?? 120);
  const [inactivityMin, setInactivityMin] = useState(editingReminder?.inactivityMin ?? 120);
  const [activeFrom, setActiveFrom] = useState(editingReminder?.activeFrom ?? "08:00");
  const [activeTo, setActiveTo] = useState(editingReminder?.activeTo ?? "22:00");
  const [saving, setSaving] = useState(false);

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setType(preset.type as any);
    setLabel(preset.label);
    setCategory(preset.category ?? "");
    if (preset.scheduleType) setScheduleType(preset.scheduleType as any);
    if (preset.time) setTime(preset.time);
    if (preset.intervalMin) setIntervalMin(preset.intervalMin);
    if (preset.inactivityMin) setInactivityMin(preset.inactivityMin);
    setActiveFrom(preset.activeFrom);
    setActiveTo(preset.activeTo);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const dto: CreateReminderDto = {
        type,
        label,
        category: category || undefined,
        scheduleType: type === "scheduled" ? scheduleType : undefined,
        time: type === "scheduled" && scheduleType === "daily" ? time : undefined,
        intervalMin: type === "scheduled" && scheduleType === "interval" ? intervalMin : undefined,
        inactivityMin: type === "inactivity" ? inactivityMin : undefined,
        activeFrom,
        activeTo,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      };

      if (editingReminder) {
        const { type: _, timezone: __, ...updateFields } = dto;
        await updateReminder(editingReminder.id, updateFields);
      } else {
        await createReminder(dto);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer.Root open onOpenChange={(open) => !open && onClose()}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/60 z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-slate-900 rounded-t-2xl max-h-[85vh] overflow-y-auto">
          <div className="mx-auto w-12 h-1.5 bg-slate-700 rounded-full mt-3 mb-2" />
          <div className="px-4 pb-8">
            <h2 className="text-lg font-semibold text-white mb-4">
              {editingReminder ? "Edit Reminder" : "New Reminder"}
            </h2>

            {/* Presets (only for new) */}
            {!editingReminder && (
              <div className="mb-4">
                <p className="text-xs text-slate-400 mb-2">Quick start</p>
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p) => {
                    const icon = p.category
                      ? CATEGORY_CONFIG[p.category as EventCategory]?.icon
                      : "";
                    return (
                      <button
                        key={p.label}
                        onClick={() => applyPreset(p)}
                        className="px-3 py-1.5 rounded-full bg-slate-800 text-xs text-slate-300 hover:bg-slate-700"
                      >
                        {icon} {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Type selector */}
            <div className="mb-4">
              <label className="block text-xs text-slate-400 mb-1">Type</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setType("scheduled")}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                    type === "scheduled"
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  Scheduled
                </button>
                <button
                  onClick={() => setType("inactivity")}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                    type === "inactivity"
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  Inactivity
                </button>
              </div>
            </div>

            {/* Label */}
            <div className="mb-4">
              <label className="block text-xs text-slate-400 mb-1">Label</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                placeholder="Reminder name"
              />
            </div>

            {/* Category */}
            <div className="mb-4">
              <label className="block text-xs text-slate-400 mb-1">Category</label>
              <div className="flex flex-wrap gap-1.5">
                {EVENT_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat === category ? "" : cat)}
                    className={`px-2.5 py-1 rounded-full text-xs ${
                      category === cat
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {CATEGORY_CONFIG[cat].icon} {CATEGORY_CONFIG[cat].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Scheduled options */}
            {type === "scheduled" && (
              <div className="mb-4 space-y-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Schedule</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setScheduleType("daily")}
                      className={`flex-1 py-2 rounded-lg text-sm ${
                        scheduleType === "daily"
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      Daily
                    </button>
                    <button
                      onClick={() => setScheduleType("interval")}
                      className={`flex-1 py-2 rounded-lg text-sm ${
                        scheduleType === "interval"
                          ? "bg-indigo-600 text-white"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      Interval
                    </button>
                  </div>
                </div>
                {scheduleType === "daily" && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Time</label>
                    <input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                    />
                  </div>
                )}
                {scheduleType === "interval" && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">
                      Every (minutes)
                    </label>
                    <input
                      type="number"
                      value={intervalMin}
                      onChange={(e) => setIntervalMin(Number(e.target.value))}
                      min={15}
                      max={1440}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Inactivity options */}
            {type === "inactivity" && (
              <div className="mb-4">
                <label className="block text-xs text-slate-400 mb-1">
                  Alert after (minutes without logging)
                </label>
                <input
                  type="number"
                  value={inactivityMin}
                  onChange={(e) => setInactivityMin(Number(e.target.value))}
                  min={30}
                  max={1440}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
            )}

            {/* Active window */}
            <div className="mb-6">
              <label className="block text-xs text-slate-400 mb-1">
                Active window (don't notify outside)
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="time"
                  value={activeFrom}
                  onChange={(e) => setActiveFrom(e.target.value)}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                />
                <span className="text-slate-500">—</span>
                <input
                  type="time"
                  value={activeTo}
                  onChange={(e) => setActiveTo(e.target.value)}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
            </div>

            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={saving || !label}
              className="w-full py-3 rounded-lg font-medium bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : editingReminder ? "Update" : "Create Reminder"}
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `pnpm --filter @memo/web exec -- tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/web/src/components/reminders/ReminderSheet.tsx
git commit -m "Add ReminderSheet component with presets and form"
```

---

### Task 13: Integrate reminders into ProfilePage

**Files:**
- Modify: `packages/web/src/pages/ProfilePage.tsx`

**Step 1: Update ProfilePage**

Add reminders section between the save button and the sign-out section. Add imports and state for the reminder sheet. Also add push subscription prompt.

Full updated `packages/web/src/pages/ProfilePage.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthContext";
import { api } from "../api/client";
import { ReminderList } from "../components/reminders/ReminderList";
import { ReminderSheet } from "../components/reminders/ReminderSheet";
import { usePushSubscription } from "../hooks/usePushSubscription";
import type { ReminderResponse } from "@memo/shared";

export function ProfilePage() {
  const { user, logout } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [editingReminder, setEditingReminder] = useState<ReminderResponse | null>(null);
  const { subscribed, subscribe } = usePushSubscription();

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ name: name || undefined }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const handleAddReminder = async () => {
    if (!subscribed) {
      const ok = await subscribe();
      if (!ok) return;
    }
    setEditingReminder(null);
    setShowSheet(true);
  };

  const handleEditReminder = (reminder: ReminderResponse) => {
    setEditingReminder(reminder);
    setShowSheet(true);
  };

  const handleSheetClose = () => {
    setShowSheet(false);
    setEditingReminder(null);
  };

  return (
    <div className="px-4 pt-6 pb-20">
      <h1 className="text-xl font-bold mb-6">Profile</h1>

      <form onSubmit={handleSave} className="space-y-4 max-w-sm">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Email</label>
          <input
            type="email"
            value={user?.email ?? ""}
            disabled
            className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-3 text-slate-500 cursor-not-allowed"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            placeholder="Your name"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium rounded-lg py-3 transition-colors"
        >
          {saved ? "Saved!" : saving ? "Saving..." : "Save"}
        </button>
      </form>

      {/* Reminders Section */}
      <div className="mt-8 pt-6 border-t border-slate-800 max-w-sm">
        <h2 className="text-sm font-semibold text-slate-300 mb-3">Reminders</h2>
        <ReminderList onAdd={handleAddReminder} onEdit={handleEditReminder} />
      </div>

      <div className="mt-8 pt-6 border-t border-slate-800">
        <p className="text-xs text-slate-500 mb-4">
          Member since{" "}
          {user?.createdAt
            ? new Date(user.createdAt).toLocaleDateString()
            : "..."}
        </p>
        <button
          onClick={logout}
          className="text-red-400 hover:text-red-300 text-sm font-medium"
        >
          Sign Out
        </button>
      </div>

      {showSheet && (
        <ReminderSheet
          editingReminder={editingReminder}
          onClose={handleSheetClose}
          onSaved={handleSheetClose}
        />
      )}
    </div>
  );
}
```

**Step 2: Full frontend build check**

Run: `pnpm --filter @memo/shared build && pnpm --filter @memo/web exec -- tsc --noEmit`

**Step 3: Commit**

```bash
git add packages/web/src/pages/ProfilePage.tsx
git commit -m "Integrate reminders section into ProfilePage"
```

---

### Task 14: End-to-end verification

**Step 1: Start the full stack**

Make sure VAPID keys are in `.env` (both `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_EMAIL` for backend and `VITE_VAPID_PUBLIC_KEY` for frontend).

Run: `docker compose up -d && pnpm dev`

**Step 2: Test push subscription flow**

1. Login to the app
2. Go to Profile
3. Click "+ Add Reminder"
4. Browser should prompt for notification permission — allow it
5. Verify no errors in console

**Step 3: Test reminder creation**

1. Click "Drink water" preset
2. Verify fields are populated (inactivity, water, 120 min)
3. Click "Create Reminder"
4. Verify reminder appears in the list with toggle

**Step 4: Test reminder toggle and delete**

1. Toggle a reminder off → verify it updates
2. Toggle it back on
3. Delete a reminder → verify it disappears

**Step 5: Test scheduled notification**

1. Create a "daily" reminder with time = current time + 1 minute
2. Wait for the cron to fire
3. Verify push notification appears on device
4. Click notification → verify app opens

**Step 6: Test edge cases**

- Create reminder outside active window → should NOT fire
- Create inactivity reminder → log an event for that category → should NOT fire until inactivityMin passes

**Step 7: Commit any fixes**

```bash
git add -u
git commit -m "Fix: [description]"
```
