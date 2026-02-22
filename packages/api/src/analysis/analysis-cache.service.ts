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

  async getLatest(userId: string) {
    const cached = await this.prisma.analysisCache.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    if (!cached) return null;
    return {
      result: cached.result,
      period: {
        start: cached.periodStart,
        end: cached.periodEnd,
      },
      createdAt: cached.createdAt,
    };
  }

  async getById(id: string, userId: string) {
    const cached = await this.prisma.analysisCache.findFirst({
      where: { id, userId },
    });
    if (!cached) return null;
    return {
      result: cached.result,
      period: {
        start: cached.periodStart,
        end: cached.periodEnd,
      },
      createdAt: cached.createdAt,
    };
  }

  async getHistory(userId: string) {
    const rows = await this.prisma.analysisCache.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        periodStart: true,
        periodEnd: true,
        createdAt: true,
        result: true,
      },
    });

    return rows.map((row) => {
      const result = row.result as Record<string, any>;
      const analysis = result?.analysis ?? {};
      const hs = analysis?.health_score ?? {};
      return {
        id: row.id,
        periodStart: row.periodStart.toISOString(),
        periodEnd: row.periodEnd.toISOString(),
        createdAt: row.createdAt.toISOString(),
        healthScore: typeof hs.value === "number" ? hs.value : null,
        trend: hs.trend ?? null,
        summary: typeof analysis.summary === "string"
          ? analysis.summary.slice(0, 120)
          : null,
        entryCount: result?.meta?.entryCount ?? null,
      };
    });
  }

  async invalidate(userId: string) {
    return this.prisma.analysisCache.deleteMany({
      where: { userId },
    });
  }
}
