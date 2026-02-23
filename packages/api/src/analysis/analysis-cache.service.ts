import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { EncryptionService } from "../encryption/encryption.service";
import { SessionStoreService } from "../encryption/session-store.service";

@Injectable()
export class AnalysisCacheService {
  constructor(
    private prisma: PrismaService,
    private encryption: EncryptionService,
    private sessionStore: SessionStoreService,
  ) {}

  private getDEK(userId: string): Buffer {
    const dek = this.sessionStore.get(userId);
    if (!dek) throw new UnauthorizedException("SESSION_ENCRYPTION_EXPIRED");
    return dek;
  }

  private encryptResult(dek: Buffer, result: unknown): Buffer {
    return this.encryption.encrypt(
      dek,
      Buffer.from(JSON.stringify(result), "utf8"),
    );
  }

  private decryptResult(dek: Buffer, blob: Buffer): unknown {
    return JSON.parse(this.encryption.decrypt(dek, blob).toString("utf8"));
  }

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
    // Don't serve stale cache entries — they are kept for history only
    if (!cached || cached.stale) return null;
    const dek = this.getDEK(userId);
    return this.decryptResult(dek, cached.result as Buffer);
  }

  async set(
    userId: string,
    periodStart: Date,
    periodEnd: Date,
    focus: string[] | null,
    result: unknown,
  ) {
    const focusHash = this.hashFocus(focus);
    const dek = this.getDEK(userId);
    const encrypted = this.encryptResult(dek, result);
    return this.prisma.analysisCache.upsert({
      where: {
        userId_periodStart_periodEnd_focusHash: {
          userId,
          periodStart,
          periodEnd,
          focusHash,
        },
      },
      update: { result: encrypted, stale: false, createdAt: new Date() },
      create: {
        userId,
        periodStart,
        periodEnd,
        focusHash,
        result: encrypted,
        stale: false,
      },
    });
  }

  async getLatest(userId: string) {
    const cached = await this.prisma.analysisCache.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    if (!cached) return null;
    const dek = this.getDEK(userId);
    return {
      result: this.decryptResult(dek, cached.result as Buffer),
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
    const dek = this.getDEK(userId);
    return {
      result: this.decryptResult(dek, cached.result as Buffer),
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

    const dek = this.getDEK(userId);
    return rows.map((row) => {
      const result = this.decryptResult(dek, row.result as Buffer) as Record<
        string,
        any
      >;
      const analysis = result?.analysis ?? {};
      const hs = analysis?.health_score ?? {};
      return {
        id: row.id,
        periodStart: row.periodStart.toISOString(),
        periodEnd: row.periodEnd.toISOString(),
        createdAt: row.createdAt.toISOString(),
        healthScore: typeof hs.value === "number" ? hs.value : null,
        trend: hs.trend ?? null,
        summary:
          typeof analysis.summary === "string"
            ? analysis.summary.slice(0, 120)
            : null,
        entryCount: result?.meta?.entryCount ?? null,
      };
    });
  }

  async invalidate(userId: string) {
    return this.prisma.analysisCache.updateMany({
      where: { userId, stale: false },
      data: { stale: true },
    });
  }
}
