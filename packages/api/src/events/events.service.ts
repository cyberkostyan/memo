import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AnalysisCacheService } from "../analysis/analysis-cache.service";
import { EncryptionService } from "../encryption/encryption.service";
import { SessionStoreService } from "../encryption/session-store.service";
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
    private encryption: EncryptionService,
    private sessionStore: SessionStoreService,
  ) {}

  private getDEK(userId: string): Uint8Array {
    const dek = this.sessionStore.get(userId);
    if (!dek) throw new UnauthorizedException("SESSION_ENCRYPTION_EXPIRED");
    return dek;
  }

  private encryptField(dek: Uint8Array, data: string | object): Uint8Array<ArrayBuffer> {
    const str = typeof data === "string" ? data : JSON.stringify(data);
    return this.encryption.encrypt(dek, new TextEncoder().encode(str));
  }

  private decryptJson(dek: Uint8Array, blob: Uint8Array): unknown {
    return JSON.parse(Buffer.from(this.encryption.decrypt(dek, blob)).toString("utf8"));
  }

  private decryptString(dek: Uint8Array, blob: Uint8Array): string {
    return Buffer.from(this.encryption.decrypt(dek, blob)).toString("utf8");
  }

  async create(userId: string, dto: CreateEventDto) {
    const dek = this.getDEK(userId);
    const encryptedDetails = dto.details
      ? this.encryptField(dek, dto.details)
      : undefined;
    const encryptedNote = dto.note
      ? this.encryptField(dek, dto.note)
      : undefined;

    const event = await this.prisma.event.create({
      data: {
        userId,
        category: dto.category,
        details: encryptedDetails,
        note: encryptedNote,
        timestamp: dto.timestamp ? new Date(dto.timestamp) : new Date(),
      },
    });
    await this.analysisCache.invalidate(userId);
    return {
      ...event,
      details: dto.details ?? null,
      note: dto.note ?? null,
      attachmentMeta: null,
    };
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

    const dek = this.getDEK(userId);
    const mapped = data.map((e) => {
      const { attachment, ...rest } = e;
      return {
        ...rest,
        details: e.details ? this.decryptJson(dek, e.details as Uint8Array) : null,
        note: e.note ? this.decryptString(dek, e.note as Uint8Array) : null,
        attachmentMeta: mapAttachmentMeta({ attachment }),
      };
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
    const dek = this.getDEK(userId);
    const { attachment, ...rest } = event;
    return {
      ...rest,
      details: event.details
        ? this.decryptJson(dek, event.details as Uint8Array)
        : null,
      note: event.note
        ? this.decryptString(dek, event.note as Uint8Array)
        : null,
      attachmentMeta: mapAttachmentMeta({ attachment }),
    };
  }

  async update(userId: string, id: string, dto: UpdateEventDto) {
    await this.findOne(userId, id);
    const dek = this.getDEK(userId);

    const encryptedDetails =
      dto.details !== undefined
        ? dto.details
          ? this.encryptField(dek, dto.details)
          : null
        : undefined;
    const encryptedNote =
      dto.note !== undefined
        ? dto.note
          ? this.encryptField(dek, dto.note)
          : null
        : undefined;

    const updated = await this.prisma.event.update({
      where: { id },
      data: {
        details: encryptedDetails,
        note: encryptedNote,
        ratedAt: null,
        timestamp: dto.timestamp ? new Date(dto.timestamp) : undefined,
      },
      include: { attachment: ATTACHMENT_META_SELECT },
    });
    await this.analysisCache.invalidate(userId);
    const { attachment, ...rest } = updated;
    return {
      ...rest,
      details: updated.details
        ? this.decryptJson(dek, updated.details as Uint8Array)
        : null,
      note: updated.note
        ? this.decryptString(dek, updated.note as Uint8Array)
        : null,
      attachmentMeta: mapAttachmentMeta({ attachment }),
    };
  }

  async remove(userId: string, id: string) {
    await this.findOne(userId, id);
    await this.prisma.event.delete({ where: { id } });
    await this.analysisCache.invalidate(userId);
    return { deleted: true };
  }
}
