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
