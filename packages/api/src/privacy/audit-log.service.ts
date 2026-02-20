import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
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
    return this.prisma.auditLog.create({
      data: {
        ...params,
        details: params.details as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async findByUser(targetId: string, limit = 50, offset = 0) {
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
