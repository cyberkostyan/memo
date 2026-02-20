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
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) throw new UnauthorizedException();

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException("Invalid password");

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
