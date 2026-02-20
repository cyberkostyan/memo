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
