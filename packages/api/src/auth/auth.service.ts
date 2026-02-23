import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { ConsentService } from "../privacy/consent.service";
import { EncryptionService } from "../encryption/encryption.service";
import { SessionStoreService } from "../encryption/session-store.service";
import type {
  RegisterDto,
  LoginDto,
  AuthTokens,
  ChangePasswordDto,
  ResetPasswordDto,
} from "@memo/shared";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private consentService: ConsentService,
    private encryption: EncryptionService,
    private sessionStore: SessionStoreService,
  ) {}

  async register(
    dto: RegisterDto,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthTokens> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException("Email already registered");
    }

    const hash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { email: dto.email, password: hash, name: dto.name },
    });

    // Generate encryption keys for the new user
    const salt = this.encryption.generateSalt();
    const dek = this.encryption.generateDEK();
    const kek = this.encryption.deriveKEK(dto.password, salt);
    const { encrypted, nonce } = this.encryption.wrapDEK(kek, dek);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { encryptionSalt: salt, encryptedDEK: encrypted, dekNonce: nonce },
    });

    this.sessionStore.set(user.id, dek);

    await this.consentService.createInitialConsent(
      user.id,
      ipAddress,
      userAgent,
    );

    return this.generateTokens(user.id);
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    let dek: Uint8Array;

    if (!user.encryptionSalt || !user.encryptedDEK || !user.dekNonce) {
      // First login after encryption migration — generate keys and encrypt existing data
      dek = await this.setupEncryption(user.id, dto.password);
    } else {
      // Normal flow — decrypt DEK
      const kek = this.encryption.deriveKEK(dto.password, user.encryptionSalt);
      dek = this.encryption.unwrapDEK(kek, user.encryptedDEK, user.dekNonce);
    }

    this.sessionStore.set(user.id, dek);

    return this.generateTokens(user.id);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!stored || stored.expiresAt < new Date()) {
      if (stored) {
        await this.prisma.refreshToken.deleteMany({ where: { id: stored.id } });
      }
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    // Rotate: delete old token (deleteMany won't throw on concurrent requests)
    await this.prisma.refreshToken.deleteMany({ where: { id: stored.id } });

    return this.generateTokens(stored.userId);
  }

  async logout(refreshToken: string, userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: { token: refreshToken },
    });
    this.sessionStore.delete(userId);
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();

    const valid = await bcrypt.compare(dto.oldPassword, user.password);
    if (!valid) throw new UnauthorizedException("Invalid current password");

    const dek = this.sessionStore.get(userId);
    if (!dek) throw new UnauthorizedException("SESSION_ENCRYPTION_EXPIRED");

    const newHash = await bcrypt.hash(dto.newPassword, 10);
    const newSalt = this.encryption.generateSalt();
    const newKek = this.encryption.deriveKEK(dto.newPassword, newSalt);
    const { encrypted, nonce } = this.encryption.wrapDEK(newKek, dek);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: newHash,
        encryptionSalt: newSalt,
        encryptedDEK: encrypted,
        dekNonce: nonce,
      },
    });
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) return; // don't leak user existence

    // Delete all encrypted data
    await this.prisma.event.deleteMany({ where: { userId: user.id } });
    await this.prisma.analysisCache.deleteMany({ where: { userId: user.id } });

    // Generate new encryption keys
    const newHash = await bcrypt.hash(dto.newPassword, 10);
    const salt = this.encryption.generateSalt();
    const dek = this.encryption.generateDEK();
    const kek = this.encryption.deriveKEK(dto.newPassword, salt);
    const { encrypted, nonce } = this.encryption.wrapDEK(kek, dek);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: newHash,
        encryptionSalt: salt,
        encryptedDEK: encrypted,
        dekNonce: nonce,
      },
    });

    this.sessionStore.delete(user.id);
  }

  /** One-time setup: generate encryption keys and encrypt all existing plaintext data */
  private async setupEncryption(userId: string, password: string): Promise<Uint8Array> {
    const salt = this.encryption.generateSalt();
    const dek = this.encryption.generateDEK();
    const kek = this.encryption.deriveKEK(password, salt);
    const { encrypted, nonce } = this.encryption.wrapDEK(kek, dek);

    await this.prisma.user.update({
      where: { id: userId },
      data: { encryptionSalt: salt, encryptedDEK: encrypted, dekNonce: nonce },
    });

    // Encrypt existing events
    // Note: Prisma 6 returns Bytes fields as Uint8Array, not Buffer.
    // Use Buffer.from() which accepts both Uint8Array and Buffer.
    const events = await this.prisma.event.findMany({ where: { userId } });
    for (const event of events) {
      const data: Record<string, Uint8Array> = {};
      if (event.details) {
        const str = Buffer.from(event.details).toString("utf8");
        data.details = this.encryption.encrypt(dek, new Uint8Array(Buffer.from(str, "utf8")));
      }
      if (event.note) {
        const str = Buffer.from(event.note).toString("utf8");
        data.note = this.encryption.encrypt(dek, new Uint8Array(Buffer.from(str, "utf8")));
      }
      if (Object.keys(data).length > 0) {
        await this.prisma.event.update({ where: { id: event.id }, data });
      }
    }

    // Encrypt existing attachments
    const attachments = await this.prisma.attachment.findMany({
      where: { event: { userId } },
    });
    for (const att of attachments) {
      const encData = this.encryption.encrypt(dek, new Uint8Array(att.data));
      await this.prisma.attachment.update({ where: { id: att.id }, data: { data: encData } });
    }

    // Encrypt existing analysis cache
    const caches = await this.prisma.analysisCache.findMany({ where: { userId } });
    for (const cache of caches) {
      const str = Buffer.from(cache.result).toString("utf8");
      const encResult = this.encryption.encrypt(dek, new Uint8Array(Buffer.from(str, "utf8")));
      await this.prisma.analysisCache.update({ where: { id: cache.id }, data: { result: encResult } });
    }

    return dek;
  }

  private async generateTokens(userId: string): Promise<AuthTokens> {
    const accessToken = this.jwt.sign({ sub: userId });

    const token = randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: { token, userId, expiresAt },
    });

    return { accessToken, refreshToken: token };
  }
}
