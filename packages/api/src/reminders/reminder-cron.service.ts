import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { PushService } from "../push/push.service";
import { CATEGORY_CONFIG } from "@memo/shared";

@Injectable()
export class ReminderCronService {
  private readonly logger = new Logger(ReminderCronService.name);
  private readonly startedAt = Date.now();

  constructor(
    private prisma: PrismaService,
    private push: PushService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async checkReminders() {
    const uptimeMs = Date.now() - this.startedAt;
    if (uptimeMs < 120_000) {
      this.logger.debug(
        `Skipping reminder check during startup grace period (uptime: ${Math.round(uptimeMs / 1000)}s)`,
      );
      return;
    }

    const reminders = await this.prisma.reminder.findMany({
      where: { enabled: true },
      include: { user: { include: { pushSubscriptions: true } } },
    });

    this.logger.debug(`Evaluating ${reminders.length} enabled reminders`);

    for (const reminder of reminders) {
      if (reminder.user.pushSubscriptions.length === 0) {
        this.logger.debug(
          `[${reminder.id}] "${reminder.label}" — skipped (no push subscriptions)`,
        );
        continue;
      }

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
          this.logger.debug(
            `[${reminder.id}] "${reminder.label}" — FIRED for user ${reminder.userId}`,
          );
        } else {
          this.logger.debug(
            `[${reminder.id}] "${reminder.label}" — not fired`,
          );
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

  private async shouldFireScheduled(
    reminder: any,
    now: Date,
    currentTime: string,
  ): Promise<boolean> {
    if (reminder.scheduleType === "daily") {
      if (currentTime !== reminder.time) {
        this.logger.debug(
          `[${reminder.id}] daily: currentTime=${currentTime} !== time=${reminder.time}`,
        );
        return false;
      }
      if (reminder.lastSentAt) {
        const lastSentLocal = this.toTimezone(reminder.lastSentAt, reminder.timezone);
        if (this.isSameDay(lastSentLocal, now)) {
          this.logger.debug(
            `[${reminder.id}] daily: already sent today (lastSentAt=${reminder.lastSentAt.toISOString()})`,
          );
          return false;
        }
      }
      return true;
    }

    if (reminder.scheduleType === "interval") {
      const lastEvent = reminder.category
        ? await this.prisma.event.findFirst({
            where: { userId: reminder.userId, category: reminder.category },
            orderBy: { timestamp: "desc" },
          })
        : null;

      if (!reminder.lastSentAt) {
        // Never sent — but check if user recently logged a matching event
        if (lastEvent) {
          const eventElapsed = (Date.now() - lastEvent.timestamp.getTime()) / 60_000;
          this.logger.debug(
            `[${reminder.id}] interval: never sent, lastEvent ${Math.round(eventElapsed)}min ago (threshold=${reminder.intervalMin}min)`,
          );
          if (eventElapsed < reminder.intervalMin) return false;
        } else {
          this.logger.debug(`[${reminder.id}] interval: never sent, no prior events`);
        }
        return true;
      }

      const elapsedMin = (Date.now() - reminder.lastSentAt.getTime()) / 60_000;
      if (elapsedMin < reminder.intervalMin) {
        this.logger.debug(
          `[${reminder.id}] interval: ${Math.round(elapsedMin)}min since last send < ${reminder.intervalMin}min threshold`,
        );
        return false;
      }

      // Enough time since last send — but also check recent event activity
      if (lastEvent) {
        const eventElapsed = (Date.now() - lastEvent.timestamp.getTime()) / 60_000;
        this.logger.debug(
          `[${reminder.id}] interval: lastSend=${Math.round(elapsedMin)}min ago, lastEvent=${Math.round(eventElapsed)}min ago (threshold=${reminder.intervalMin}min)`,
        );
        if (eventElapsed < reminder.intervalMin) return false;
      } else {
        this.logger.debug(
          `[${reminder.id}] interval: ${Math.round(elapsedMin)}min since last send >= ${reminder.intervalMin}min, no events found`,
        );
      }

      return true;
    }

    return false;
  }

  private async shouldFireInactivity(reminder: any, now: Date): Promise<boolean> {
    if (!reminder.category || !reminder.inactivityMin) {
      this.logger.debug(
        `[${reminder.id}] inactivity: skipped (no category or inactivityMin)`,
      );
      return false;
    }

    if (reminder.lastSentAt) {
      const elapsedSinceLastSend = (Date.now() - reminder.lastSentAt.getTime()) / 60_000;
      if (elapsedSinceLastSend < reminder.inactivityMin) {
        this.logger.debug(
          `[${reminder.id}] inactivity: ${Math.round(elapsedSinceLastSend)}min since last send < ${reminder.inactivityMin}min threshold`,
        );
        return false;
      }
    }

    const lastEvent = await this.prisma.event.findFirst({
      where: { userId: reminder.userId, category: reminder.category },
      orderBy: { timestamp: "desc" },
    });

    if (!lastEvent) {
      this.logger.debug(
        `[${reminder.id}] inactivity: no events for category "${reminder.category}" — will fire`,
      );
      return true;
    }

    const elapsedMin = (Date.now() - lastEvent.timestamp.getTime()) / 60_000;
    this.logger.debug(
      `[${reminder.id}] inactivity: lastEvent ${Math.round(elapsedMin)}min ago (threshold=${reminder.inactivityMin}min)`,
    );
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
      const label = ((CATEGORY_CONFIG as any)[reminder.category]?.label ?? reminder.category).toLowerCase();
      return `No ${label} logged in the last ${hours}h`;
    }
    if (reminder.scheduleType === "interval") {
      return `Time for your ${reminder.intervalMin}-minute check-in`;
    }
    return "Time for your reminder";
  }
}
