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

const ATTACHMENT_META_SELECT = {
  select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true },
} as const;

function mapAttachmentMeta(event: { attachment?: { id: string; fileName: string; mimeType: string; size: number; createdAt: Date } | null }) {
  const a = event.attachment;
  return a
    ? { id: a.id, fileName: a.fileName, mimeType: a.mimeType, size: a.size, createdAt: a.createdAt }
    : null;
}

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
    return { ...event, attachmentMeta: null };
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
        include: { attachment: ATTACHMENT_META_SELECT },
      }),
      this.prisma.event.count({ where }),
    ]);

    const mapped = data.map((e) => {
      const { attachment, ...rest } = e;
      return { ...rest, attachmentMeta: mapAttachmentMeta({ attachment }) };
    });

    return { data: mapped, total, limit: query.limit, offset: query.offset };
  }

  async findOne(userId: string, id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: { attachment: ATTACHMENT_META_SELECT },
    });
    if (!event) throw new NotFoundException("Event not found");
    if (event.userId !== userId) throw new ForbiddenException();
    const { attachment, ...rest } = event;
    return { ...rest, attachmentMeta: mapAttachmentMeta({ attachment }) };
  }

  async update(userId: string, id: string, dto: UpdateEventDto) {
    await this.findOne(userId, id);

    const updated = await this.prisma.event.update({
      where: { id },
      data: {
        details: dto.details !== undefined ? (dto.details as Prisma.InputJsonValue) : undefined,
        note: dto.note !== undefined ? dto.note : undefined,
        ratedAt: null,
        timestamp: dto.timestamp ? new Date(dto.timestamp) : undefined,
      },
      include: { attachment: ATTACHMENT_META_SELECT },
    });
    await this.analysisCache.invalidate(userId);
    const { attachment, ...rest } = updated;
    return { ...rest, attachmentMeta: mapAttachmentMeta({ attachment }) };
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.event.delete({ where: { id } });
    await this.analysisCache.invalidate(userId);
    return { deleted: true };
  }
}
