import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { UpdateConsentDto } from "@memo/shared";

const CURRENT_POLICY_VERSION = "1.0";

@Injectable()
export class ConsentService {
  constructor(private prisma: PrismaService) {}

  async getCurrentConsents(userId: string) {
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

    // Backfill: if user has no health_data_processing consent, create one
    // (covers users registered before GDPR feature was added)
    const hasHealthConsent = consents.some(
      (c) => c.type === "health_data_processing",
    );
    if (!hasHealthConsent) {
      const created = await this.createInitialConsent(userId);
      consents.push({
        id: created.id,
        type: created.type,
        version: created.version,
        granted: created.granted,
        createdAt: created.createdAt,
      });
    }

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
