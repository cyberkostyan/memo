import {
  Injectable,
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AnalysisCacheService } from "../analysis/analysis-cache.service";
import { EncryptionService } from "../encryption/encryption.service";
import { SessionStoreService } from "../encryption/session-store.service";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
]);

// Magic bytes signatures for allowed file types
const MAGIC_BYTES: Array<{ mime: string; bytes: number[]; offset?: number }> = [
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // RIFF header; "WEBP" at offset 8
  { mime: "application/pdf", bytes: [0x25, 0x50, 0x44, 0x46] }, // %PDF
];

@Injectable()
export class AttachmentService {
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

  async upload(
    userId: string,
    eventId: string,
    file: {
      buffer: Buffer;
      mimetype: string;
      originalname: string;
      size: number;
    },
  ) {
    // 1. Verify event exists and belongs to user
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { userId: true },
    });
    if (!event) throw new NotFoundException("Event not found");
    if (event.userId !== userId) throw new NotFoundException("Event not found");

    // 2. Validate file size
    if (file.size > MAX_FILE_SIZE) {
      throw new PayloadTooLargeException(
        "File is too large. Maximum size is 10 MB.",
      );
    }

    // 3. Validate MIME type
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new UnsupportedMediaTypeException(
        "Unsupported file type. Please upload an image (JPEG, PNG, WebP, HEIC) or PDF.",
      );
    }

    // 4. Validate magic bytes
    const validMagic = this.validateMagicBytes(file.buffer, file.mimetype);
    if (!validMagic) {
      throw new BadRequestException(
        "File content does not match the declared file type.",
      );
    }

    // 5. Encrypt & upsert attachment
    const dek = this.getDEK(userId);
    const encryptedData = this.encryption.encrypt(dek, new Uint8Array(file.buffer));
    const attachment = await this.prisma.attachment.upsert({
      where: { eventId },
      create: {
        eventId,
        data: encryptedData,
        mimeType: file.mimetype,
        fileName: file.originalname,
        size: file.size,
      },
      update: {
        data: encryptedData,
        mimeType: file.mimetype,
        fileName: file.originalname,
        size: file.size,
      },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        size: true,
        createdAt: true,
      },
    });

    // 6. Invalidate analysis cache
    await this.analysisCache.invalidate(userId);

    return attachment;
  }

  async download(userId: string, eventId: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { eventId },
      include: { event: { select: { userId: true } } },
    });
    if (!attachment)
      throw new NotFoundException("No attachment found for this event.");
    if (attachment.event.userId !== userId)
      throw new NotFoundException("No attachment found for this event.");

    const dek = this.getDEK(attachment.event.userId);
    const decryptedData = this.encryption.decrypt(dek, attachment.data);
    return { ...attachment, data: decryptedData };
  }

  async remove(userId: string, eventId: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { eventId },
      include: { event: { select: { userId: true } } },
    });
    if (!attachment)
      throw new NotFoundException("No attachment found for this event.");
    if (attachment.event.userId !== userId)
      throw new NotFoundException("No attachment found for this event.");

    await this.prisma.attachment.delete({ where: { id: attachment.id } });
    await this.analysisCache.invalidate(userId);
    return { deleted: true };
  }

  private validateMagicBytes(buffer: Buffer, declaredMime: string): boolean {
    // HEIC uses ftyp box -- check for "ftyp" at offset 4
    if (declaredMime === "image/heic") {
      if (buffer.length < 12) return false;
      const ftyp = buffer.toString("ascii", 4, 8);
      return ftyp === "ftyp";
    }

    for (const sig of MAGIC_BYTES) {
      if (sig.mime !== declaredMime) continue;
      const offset = sig.offset ?? 0;
      if (buffer.length < offset + sig.bytes.length) return false;
      const match = sig.bytes.every(
        (byte, i) => buffer[offset + i] === byte,
      );
      if (match) return true;
    }

    return false;
  }
}
