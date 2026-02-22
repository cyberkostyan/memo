import { Test } from "@nestjs/testing";
import { UnauthorizedException, ConflictException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service";
import { PrismaService } from "../prisma/prisma.service";
import { ConsentService } from "../privacy/consent.service";

describe("AuthService", () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock };
    refreshToken: {
      findUnique: jest.Mock;
      create: jest.Mock;
      deleteMany: jest.Mock;
    };
  };
  let jwt: { sign: jest.Mock };
  let consent: { createInitialConsent: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn(), create: jest.fn() },
      refreshToken: {
        findUnique: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
    };
    jwt = { sign: jest.fn().mockReturnValue("access-token-123") };
    consent = { createInitialConsent: jest.fn().mockResolvedValue({}) };

    // Make refreshToken.create return a resolved value so generateTokens works
    prisma.refreshToken.create.mockResolvedValue({});

    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConsentService, useValue: consent },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  // ── refresh ──────────────────────────────────────────────────────────

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

  // ── login ────────────────────────────────────────────────────────────

  describe("login", () => {
    it("returns tokens for valid credentials", async () => {
      const hash = await bcrypt.hash("password123", 10);
      prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        password: hash,
      });

      const result = await service.login({
        email: "test@example.com",
        password: "password123",
      });

      expect(result).toEqual({
        accessToken: "access-token-123",
        refreshToken: expect.any(String),
      });
      expect(jwt.sign).toHaveBeenCalledWith({ sub: "user-1" });
    });

    it("throws for wrong password", async () => {
      const hash = await bcrypt.hash("correct-password", 10);
      prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "test@example.com",
        password: hash,
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

  // ── register ─────────────────────────────────────────────────────────

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

  // ── logout ───────────────────────────────────────────────────────────

  describe("logout", () => {
    it("deletes the refresh token", async () => {
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

      await service.logout("token-to-delete");

      expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
        where: { token: "token-to-delete" },
      });
    });

    it("does not throw for non-existent token", async () => {
      prisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.logout("nonexistent")).resolves.toBeUndefined();
    });
  });
});
