import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { EncryptionService } from "../encryption/encryption.service";
import { SessionStoreService } from "../encryption/session-store.service";
import type { DataExportResponse } from "@memo/shared";

@Injectable()
export class PrivacyService {
  constructor(
    private prisma: PrismaService,
    private encryption: EncryptionService,
    private sessionStore: SessionStoreService,
  ) {}

  private getDEK(userId: string): Uint8Array {
    const dek = this.sessionStore.get(userId);
    if (!dek) throw new UnauthorizedException("SESSION_ENCRYPTION_EXPIRED");
    return dek;
  }

  async exportUserData(userId: string): Promise<DataExportResponse> {
    const dek = this.getDEK(userId);
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
        details: e.details
          ? (JSON.parse(
              Buffer.from(this.encryption.decrypt(dek, e.details as Uint8Array)).toString("utf8"),
            ) as Record<string, unknown>)
          : null,
        note: e.note
          ? Buffer.from(this.encryption.decrypt(dek, e.note as Uint8Array)).toString("utf8")
          : null,
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
