import { Test } from "@nestjs/testing";
import {
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
  UnauthorizedException,
  UnsupportedMediaTypeException,
} from "@nestjs/common";
import { AttachmentService } from "./attachment.service";
import { PrismaService } from "../prisma/prisma.service";
import { AnalysisCacheService } from "../analysis/analysis-cache.service";
import { EncryptionService } from "../encryption/encryption.service";
import { SessionStoreService } from "../encryption/session-store.service";

describe("AttachmentService", () => {
  let service: AttachmentService;
  let prisma: {
    event: { findUnique: jest.Mock };
    attachment: { upsert: jest.Mock; findUnique: jest.Mock; delete: jest.Mock };
  };
  let analysisCache: { invalidate: jest.Mock };
  let encryptionService: EncryptionService;
  let sessionStore: { get: jest.Mock; set: jest.Mock; delete: jest.Mock };

  const userId = "user-1";
  const eventId = "event-1";
  const fakeDEK = new Uint8Array(32).fill(0xab);
  const attachmentResult = {
    id: "att-1",
    fileName: "test.jpg",
    mimeType: "image/jpeg",
    size: 1024,
    createdAt: new Date(),
  };

  // Real JPEG magic bytes: FF D8 FF E0
  const jpegBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46,
  ]);

  // Real PNG magic bytes: 89 50 4E 47
  const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // Real PDF magic bytes: %PDF
  const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

  beforeEach(async () => {
    prisma = {
      event: { findUnique: jest.fn() },
      attachment: {
        upsert: jest.fn().mockResolvedValue(attachmentResult),
        findUnique: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    analysisCache = { invalidate: jest.fn().mockResolvedValue(undefined) };
    sessionStore = {
      get: jest.fn().mockReturnValue(fakeDEK),
      set: jest.fn(),
      delete: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        AttachmentService,
        EncryptionService,
        { provide: PrismaService, useValue: prisma },
        { provide: AnalysisCacheService, useValue: analysisCache },
        { provide: SessionStoreService, useValue: sessionStore },
      ],
    }).compile();

    service = module.get(AttachmentService);
    encryptionService = module.get(EncryptionService);
  });

  const makeFile = (
    overrides: Partial<{
      buffer: Buffer;
      mimetype: string;
      originalname: string;
      size: number;
    }> = {},
  ) => ({
    buffer: jpegBuffer,
    mimetype: "image/jpeg",
    originalname: "photo.jpg",
    size: 1024,
    ...overrides,
  });

  // ── upload ──────────────────────────────────────────────────────────

  describe("upload", () => {
    beforeEach(() => {
      prisma.event.findUnique.mockResolvedValue({ userId });
    });

    it("uploads a valid JPEG file (encrypted)", async () => {
      const result = await service.upload(userId, eventId, makeFile());

      expect(result).toEqual(attachmentResult);
      const call = prisma.attachment.upsert.mock.calls[0][0];
      expect(call.where).toEqual({ eventId });
      expect(call.create.eventId).toBe(eventId);
      expect(call.create.mimeType).toBe("image/jpeg");
      expect(call.create.fileName).toBe("photo.jpg");
      expect(call.create.size).toBe(1024);
      // data should be encrypted (longer than original due to nonce + tag)
      expect(call.create.data).toBeInstanceOf(Uint8Array);
      expect(call.create.data.length).toBeGreaterThan(jpegBuffer.length);
      // Verify we can decrypt it back to the original
      const decrypted = encryptionService.decrypt(fakeDEK, call.create.data);
      expect(Buffer.from(decrypted)).toEqual(jpegBuffer);
      expect(analysisCache.invalidate).toHaveBeenCalledWith(userId);
    });

    it("uploads a valid PNG file", async () => {
      await service.upload(
        userId,
        eventId,
        makeFile({ buffer: pngBuffer, mimetype: "image/png", originalname: "img.png" }),
      );

      expect(prisma.attachment.upsert).toHaveBeenCalled();
    });

    it("uploads a valid PDF file", async () => {
      await service.upload(
        userId,
        eventId,
        makeFile({ buffer: pdfBuffer, mimetype: "application/pdf", originalname: "report.pdf" }),
      );

      expect(prisma.attachment.upsert).toHaveBeenCalled();
    });

    it("throws NotFoundException when event does not exist", async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(
        service.upload(userId, eventId, makeFile()),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws NotFoundException when event belongs to another user", async () => {
      prisma.event.findUnique.mockResolvedValue({ userId: "other-user" });

      await expect(
        service.upload(userId, eventId, makeFile()),
      ).rejects.toThrow(NotFoundException);
    });

    it("throws PayloadTooLargeException when file exceeds 10 MB", async () => {
      await expect(
        service.upload(
          userId,
          eventId,
          makeFile({ size: 11 * 1024 * 1024 }),
        ),
      ).rejects.toThrow(PayloadTooLargeException);
    });

    it("throws UnsupportedMediaTypeException for disallowed MIME types", async () => {
      await expect(
        service.upload(
          userId,
          eventId,
          makeFile({ mimetype: "application/zip" }),
        ),
      ).rejects.toThrow(UnsupportedMediaTypeException);
    });

    it("throws BadRequestException when magic bytes do not match MIME type", async () => {
      // Send PNG magic bytes but claim it's a JPEG
      await expect(
        service.upload(
          userId,
          eventId,
          makeFile({ buffer: pngBuffer, mimetype: "image/jpeg" }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException for a fake PDF (wrong magic bytes)", async () => {
      const fakeBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      await expect(
        service.upload(
          userId,
          eventId,
          makeFile({ buffer: fakeBuffer, mimetype: "application/pdf" }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("validates HEIC files by checking ftyp at offset 4", async () => {
      // HEIC: bytes 4-7 must be "ftyp"
      const heicBuffer = Buffer.alloc(16);
      heicBuffer.write("ftyp", 4, "ascii");
      heicBuffer.write("heic", 8, "ascii");

      await service.upload(
        userId,
        eventId,
        makeFile({ buffer: heicBuffer, mimetype: "image/heic", originalname: "photo.heic" }),
      );

      expect(prisma.attachment.upsert).toHaveBeenCalled();
    });

    it("rejects HEIC with wrong ftyp header", async () => {
      const badHeic = Buffer.alloc(16);
      badHeic.write("nope", 4, "ascii");

      await expect(
        service.upload(
          userId,
          eventId,
          makeFile({ buffer: badHeic, mimetype: "image/heic" }),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws UnauthorizedException when session DEK is expired", async () => {
      sessionStore.get.mockReturnValue(null);

      await expect(
        service.upload(userId, eventId, makeFile()),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── download ────────────────────────────────────────────────────────

  describe("download", () => {
    it("returns decrypted attachment when found and owned by user", async () => {
      const plainData = new TextEncoder().encode("hello world");
      const encryptedData = encryptionService.encrypt(fakeDEK, plainData);
      const attachment = {
        ...attachmentResult,
        data: encryptedData,
        event: { userId },
      };
      prisma.attachment.findUnique.mockResolvedValue(attachment);

      const result = await service.download(userId, eventId);
      expect(result.data).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(result.data).toString()).toBe("hello world");
    });

    it("throws NotFoundException when attachment does not exist", async () => {
      prisma.attachment.findUnique.mockResolvedValue(null);

      await expect(service.download(userId, eventId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws NotFoundException when attachment belongs to another user", async () => {
      prisma.attachment.findUnique.mockResolvedValue({
        ...attachmentResult,
        event: { userId: "other-user" },
      });

      await expect(service.download(userId, eventId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws UnauthorizedException when session DEK is expired", async () => {
      const encryptedData = encryptionService.encrypt(fakeDEK, new TextEncoder().encode("data"));
      prisma.attachment.findUnique.mockResolvedValue({
        ...attachmentResult,
        data: encryptedData,
        event: { userId },
      });
      sessionStore.get.mockReturnValue(null);

      await expect(service.download(userId, eventId)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ── remove ──────────────────────────────────────────────────────────

  describe("remove", () => {
    it("deletes attachment and invalidates cache", async () => {
      prisma.attachment.findUnique.mockResolvedValue({
        ...attachmentResult,
        event: { userId },
      });

      const result = await service.remove(userId, eventId);

      expect(result).toEqual({ deleted: true });
      expect(prisma.attachment.delete).toHaveBeenCalledWith({
        where: { id: "att-1" },
      });
      expect(analysisCache.invalidate).toHaveBeenCalledWith(userId);
    });

    it("throws NotFoundException when attachment does not exist", async () => {
      prisma.attachment.findUnique.mockResolvedValue(null);

      await expect(service.remove(userId, eventId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("throws NotFoundException when attachment belongs to another user", async () => {
      prisma.attachment.findUnique.mockResolvedValue({
        ...attachmentResult,
        event: { userId: "other-user" },
      });

      await expect(service.remove(userId, eventId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
