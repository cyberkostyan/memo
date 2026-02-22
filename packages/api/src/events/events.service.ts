import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AnalysisCacheService } from "../analysis/analysis-cache.service";
import type {
  CreateEventDto,
  UpdateEventDto,
  EventQueryDto,
} from "@memo/shared";

@Injectable()
export class EventsService {
  constructor(
    private prisma: PrismaService,
    private analysisCache: AnalysisCacheService,
  ) {}

  async create(userId: string, dto: CreateEventDto) {
    const event = await this.prisma.event.create({
      data: {
        userId,
        category: dto.category,
        details: (dto.details as Prisma.InputJsonValue) ?? undefined,
        note: dto.note,
        timestamp: dto.timestamp ? new Date(dto.timestamp) : new Date(),
      },
    });
    await this.analysisCache.invalidate(userId);
    return event;
  }

  async findAll(userId: string, query: EventQueryDto) {
    const where: any = { userId };

    if (query.category) {
      where.category = query.category;
    }
    if (query.from || query.to) {
      where.timestamp = {};
      if (query.from) where.timestamp.gte = new Date(query.from);
      if (query.to) where.timestamp.lte = new Date(query.to);
    }

    const [data, total] = await Promise.all([
      this.prisma.event.findMany({
        where,
        orderBy: { timestamp: "desc" },
        take: query.limit,
        skip: query.offset,
      }),
      this.prisma.event.count({ where }),
    ]);

    return { data, total, limit: query.limit, offset: query.offset };
  }

  async findOne(userId: string, id: string) {
    const event = await this.prisma.event.findUnique({ where: { id } });
    if (!event) throw new NotFoundException("Event not found");
    if (event.userId !== userId) throw new ForbiddenException();
    return event;
  }

  async update(userId: string, id: string, dto: UpdateEventDto) {
    const event = await this.findOne(userId, id);

    const updated = await this.prisma.event.update({
      where: { id: event.id },
      data: {
        details: dto.details !== undefined ? (dto.details as Prisma.InputJsonValue) : undefined,
        note: dto.note !== undefined ? dto.note : undefined,
        ratedAt: null,
        timestamp: dto.timestamp ? new Date(dto.timestamp) : undefined,
      },
    });
    await this.analysisCache.invalidate(userId);
    return updated;
  }

  async remove(userId: string, id: string) {
    const event = await this.findOne(userId, id);
    await this.prisma.event.delete({ where: { id: event.id } });
    await this.analysisCache.invalidate(userId);
    return { deleted: true };
  }
}
