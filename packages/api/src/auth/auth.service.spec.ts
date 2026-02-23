import { Test } from "@nestjs/testing";
import { UnauthorizedException, ConflictException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { ConsentService } from "../privacy/consent.service";
import { EncryptionService } from "../encryption/encryption.service";
import { SessionStoreService } from "../encryption/session-store.service";

/** Helper: compare two Uint8Arrays */
const arraysEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

describe("AuthService", () => {
  let service: AuthService;
  let encryption: EncryptionService;
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    refreshToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
    event: { deleteMany: jest.Mock };
    analysisCache: { deleteMany: jest.Mock };
  };
  let jwt: { sign: jest.Mock };
  let consent: { createInitialConsent: jest.Mock };
  let sessionStore: { set: jest.Mock; get: jest.Mock; delete: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      refreshToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      event: { deleteMany: jest.fn() },
      analysisCache: { deleteMany: jest.fn() },
    };
    jwt = { sign: jest.fn().mockReturnValue("access-token-123") };
    consent = { createInitialConsent: jest.fn().mockResolvedValue({}) };
    sessionStore = { set: jest.fn(), get: jest.fn(), delete: jest.fn() };

    // Make refreshToken.create return a resolved value so generateTokens works
    prisma.refreshToken.create.mockResolvedValue({});
    prisma.user.update.mockResolvedValue({});

    // Use real EncryptionService (real crypto operations)
    encryption = new EncryptionService();

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConsentService, useValue: consent },
        { provide: EncryptionService, useValue: encryption },
        { provide: SessionStoreService, useValue: sessionStore },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  // -- refresh ----------------------------------------------------------------

  describe("refresh", () => {
    it("returns new tokens for a valid refresh token", async () => {
      const storedToken = {
        id: "rt-1",
        token: "valid-token",
        userId: "user-1",
        expiresAt: new Date(Date.now() + 86_400_000), // tomorrow
      };
      prisma.refreshToken.findUnique.mockResolvedValue(storedToken);
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.refresh("valid-token");

      expect(result).toEqual({
        accessToken: "access-token-123",
        refreshToken: expect.any(String),
      });
      // Old token deleted
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { id: "rt-1" },
      });
      // New token created
      expect(prisma.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user-1",
          token: expect.any(String),
        }),
      });
      // JWT signed with user id
      expect(jwt.sign).toHaveBeenCalledWith({ sub: "user-1" });
    });

    it("throws for a non-existent refresh token", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh("nonexistent")).rejects.toThrow(
        UnauthorizedException,
      );
      // Should not try to delete
      expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
    });

    it("throws and deletes an expired refresh token", async () => {
      const expired = {
        id: "rt-expired",
        token: "expired-token",
        userId: "user-1",
        expiresAt: new Date(Date.now() - 86_400_000), // yesterday
      };
      prisma.refreshToken.findUnique.mockResolvedValue(expired);
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

      await expect(service.refresh("expired-token")).rejects.toThrow(
        UnauthorizedException,
      );
      // Expired token cleaned up
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { id: "rt-expired" },
      });
    });

    it("rotates the token (old deleted, new created)", async () => {
      const storedToken = {
        id: "rt-old",
        token: "old-token",
        userId: "user-1",
        expiresAt: new Date(Date.now() + 86_400_000),
      };
      prisma.refreshToken.findUnique.mockResolvedValue(storedToken);
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

      const result = await service.refresh("old-token");

      // Old token deleted
      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { id: "rt-old" },
      });
      // New token is different from old
      expect(result.refreshToken).not.toBe("old-token");
      // New token saved to DB
      const createCall = prisma.refreshToken.create.mock.calls[0][0];
      expect(createCall.data.token).toBe(result.refreshToken);
      expect(createCall.data.userId).toBe("user-1");
      // Expiry is ~7 days from now
      const expiry = createCall.data.expiresAt as Date;
      const daysUntilExpiry =
        (expiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      expect(daysUntilExpiry).toBeGreaterThan(6.9);
      expect(daysUntilExpiry).toBeLessThan(7.1);
    });

    it("second refresh with same token fails (simulating rotation)", async () => {
      const storedToken = {
        id: "rt-1",
        token: "token-1",
        userId: "user-1",
        expiresAt: new Date(Date.now() + 86_400_000),
      };

      // First call: token exists
      prisma.refreshToken.findUnique.mockResolvedValueOnce(storedToken);
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

      await service.refresh("token-1");

      // Second call: token no longer exists (was rotated)
      prisma.refreshToken.findUnique.mockResolvedValueOnce(null);

      await expect(service.refresh("token-1")).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // -- login ------------------------------------------------------------------

  describe("login", () => {
    it("returns tokens for valid credentials", async () => {
      // Create real encryption keys for test data
      const password = "password123";
      const salt = encryption.generateSalt();
      const dek = encryption.generateDEK();
      const kek = encryption.deriveKEK(password, salt);
      const { encrypted, nonce } = encryption.wrapDEK(kek, dek);

      const hash = await bcrypt.hash(password, 10);
      prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        password: hash,
        encryptionSalt: salt,
        encryptedDEK: encrypted,
        dekNonce: nonce,
      });

      const result = await service.login({
        email: "test@example.com",
        password,
      });

      expect(result).toEqual({
        accessToken: "access-token-123",
        refreshToken: expect.any(String),
      });
      expect(jwt.sign).toHaveBeenCalledWith({ sub: "user-1" });
    });

    it("decrypts DEK and stores in session on login", async () => {
      const password = "password123";
      const salt = encryption.generateSalt();
      const dek = encryption.generateDEK();
      const kek = encryption.deriveKEK(password, salt);
      const { encrypted, nonce } = encryption.wrapDEK(kek, dek);

      const hash = await bcrypt.hash(password, 10);
      prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        password: hash,
        encryptionSalt: salt,
        encryptedDEK: encrypted,
        dekNonce: nonce,
      });

      await service.login({ email: "test@example.com", password });

      expect(sessionStore.set).toHaveBeenCalledWith("user-1", expect.any(Uint8Array));
      // Verify the decrypted DEK matches the original
      const storedDek = sessionStore.set.mock.calls[0][1] as Uint8Array;
      expect(arraysEqual(storedDek, dek)).toBe(true);
    });

    it("throws for wrong password", async () => {
      const salt = encryption.generateSalt();
      const dek = encryption.generateDEK();
      const kek = encryption.deriveKEK("correct-password", salt);
      const { encrypted, nonce } = encryption.wrapDEK(kek, dek);

      const hash = await bcrypt.hash("correct-password", 10);
      prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        password: hash,
        encryptionSalt: salt,
        encryptedDEK: encrypted,
        dekNonce: nonce,
      });

      await expect(
        service.login({ email: "test@example.com", password: "wrong" }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("throws for non-existent user", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: "no@example.com", password: "whatever" }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // -- register ---------------------------------------------------------------

  describe("register", () => {
    it("creates user and returns tokens", async () => {
      prisma.user.findUnique.mockResolvedValue(null); // no existing
      prisma.user.create.mockResolvedValue({
        id: "new-user",
        email: "new@example.com",
      });

      const result = await service.register({
        email: "new@example.com",
        password: "pass123",
        name: "Test",
        consentToHealthData: true,
      });

      expect(result).toEqual({
        accessToken: "access-token-123",
        refreshToken: expect.any(String),
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: "new@example.com",
          password: expect.any(String), // bcrypt hash
          name: "Test",
        },
      });
      expect(consent.createInitialConsent).toHaveBeenCalledWith(
        "new-user",
        undefined,
        undefined,
      );
    });

    it("generates encryption keys and stores DEK in session", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: "new-user",
        email: "new@example.com",
      });

      await service.register({
        email: "new@example.com",
        password: "pass123",
        name: "Test",
        consentToHealthData: true,
      });

      // Encryption keys saved to user record
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "new-user" },
        data: {
          encryptionSalt: expect.any(Uint8Array),
          encryptedDEK: expect.any(Uint8Array),
          dekNonce: expect.any(Uint8Array),
        },
      });

      // DEK stored in session
      expect(sessionStore.set).toHaveBeenCalledWith(
        "new-user",
        expect.any(Uint8Array),
      );

      // Verify the stored DEK can be unwrapped from the saved encryption data
      const updateCall = prisma.user.update.mock.calls[0][0];
      const savedSalt = updateCall.data.encryptionSalt as Uint8Array;
      const savedEncrypted = updateCall.data.encryptedDEK as Uint8Array;
      const savedNonce = updateCall.data.dekNonce as Uint8Array;
      const sessionDek = sessionStore.set.mock.calls[0][1] as Uint8Array;

      const kek = encryption.deriveKEK("pass123", savedSalt);
      const unwrapped = encryption.unwrapDEK(kek, savedEncrypted, savedNonce);
      expect(arraysEqual(unwrapped, sessionDek)).toBe(true);
    });

    it("throws ConflictException for duplicate email", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "existing" });

      await expect(
        service.register({
          email: "taken@example.com",
          password: "pass123",
          name: "Test",
          consentToHealthData: true,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it("hashes the password before storing", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: "u1",
        email: "new@example.com",
      });

      await service.register({
        email: "new@example.com",
        password: "mypassword",
        name: "Test",
        consentToHealthData: true,
      });

      const storedPassword = prisma.user.create.mock.calls[0][0].data.password;
      expect(storedPassword).not.toBe("mypassword");
      expect(await bcrypt.compare("mypassword", storedPassword)).toBe(true);
    });
  });

  // -- logout -----------------------------------------------------------------

  describe("logout", () => {
    it("deletes the refresh token and clears session", async () => {
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

      await service.logout("token-to-delete", "user-1");

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { token: "token-to-delete" },
      });
      expect(sessionStore.delete).toHaveBeenCalledWith("user-1");
    });

    it("does not throw for non-existent token", async () => {
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.logout("nonexistent", "user-1"),
      ).resolves.toBeUndefined();
    });

    it("clears session store on logout", async () => {
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

      await service.logout("some-token", "user-42");

      expect(sessionStore.delete).toHaveBeenCalledWith("user-42");
    });
  });

  // -- changePassword ---------------------------------------------------------

  describe("changePassword", () => {
    it("re-wraps DEK with new password", async () => {
      const enc = new EncryptionService();
      const dek = enc.generateDEK();
      sessionStore.get.mockReturnValue(dek);

      const hash = await bcrypt.hash("oldpass", 10);
      prisma.user.findUnique.mockResolvedValue({ id: "user-1", password: hash });
      prisma.user.update.mockResolvedValue({});

      await service.changePassword("user-1", { oldPassword: "oldpass", newPassword: "newpass" });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: {
          password: expect.any(String),
          encryptionSalt: expect.any(Uint8Array),
          encryptedDEK: expect.any(Uint8Array),
          dekNonce: expect.any(Uint8Array),
        },
      });
    });

    it("throws for wrong old password", async () => {
      const hash = await bcrypt.hash("correct", 10);
      prisma.user.findUnique.mockResolvedValue({ id: "user-1", password: hash });

      await expect(
        service.changePassword("user-1", { oldPassword: "wrong", newPassword: "newpass" }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // -- resetPassword ----------------------------------------------------------

  describe("resetPassword", () => {
    it("deletes all encrypted data and generates new keys", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "user-1", email: "a@b.com" });
      prisma.event.deleteMany.mockResolvedValue({ count: 5 });
      prisma.analysisCache.deleteMany.mockResolvedValue({ count: 2 });
      prisma.user.update.mockResolvedValue({});

      await service.resetPassword({ email: "a@b.com", newPassword: "newpass" });

      expect(prisma.event.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
      expect(prisma.analysisCache.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "user-1" },
        data: expect.objectContaining({
          password: expect.any(String),
          encryptionSalt: expect.any(Uint8Array),
          encryptedDEK: expect.any(Uint8Array),
          dekNonce: expect.any(Uint8Array),
        }),
      });
      expect(sessionStore.delete).toHaveBeenCalledWith("user-1");
    });

    it("silently returns for non-existent email", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.resetPassword({ email: "no@b.com", newPassword: "x" })).resolves.toBeUndefined();
    });
  });
});
