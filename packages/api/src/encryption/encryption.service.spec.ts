import { EncryptionService } from "./encryption.service";

/** Helper: compare two Buffers by hex to avoid TS 5.9 Buffer/Uint8Array mismatch */
const hex = (b: Buffer) => b.toString("hex");

describe("EncryptionService", () => {
  let service: EncryptionService;

  beforeEach(() => {
    service = new EncryptionService();
  });

  describe("deriveKEK", () => {
    it("derives a 32-byte key from password and salt", () => {
      const salt = Buffer.alloc(32, 1);
      const kek = service.deriveKEK("password123", salt);
      expect(kek).toBeInstanceOf(Buffer);
      expect(kek.length).toBe(32);
    });

    it("produces different keys for different passwords", () => {
      const salt = Buffer.alloc(32, 1);
      const kek1 = service.deriveKEK("password1", salt);
      const kek2 = service.deriveKEK("password2", salt);
      expect(hex(kek1)).not.toBe(hex(kek2));
    });

    it("produces different keys for different salts", () => {
      const salt1 = Buffer.alloc(32, 1);
      const salt2 = Buffer.alloc(32, 2);
      const kek1 = service.deriveKEK("password", salt1);
      const kek2 = service.deriveKEK("password", salt2);
      expect(hex(kek1)).not.toBe(hex(kek2));
    });
  });

  describe("generateDEK", () => {
    it("generates a 32-byte random key", () => {
      const dek = service.generateDEK();
      expect(dek).toBeInstanceOf(Buffer);
      expect(dek.length).toBe(32);
    });

    it("generates unique keys each call", () => {
      const dek1 = service.generateDEK();
      const dek2 = service.generateDEK();
      expect(hex(dek1)).not.toBe(hex(dek2));
    });
  });

  describe("generateSalt", () => {
    it("generates a 32-byte random salt", () => {
      const salt = service.generateSalt();
      expect(salt).toBeInstanceOf(Buffer);
      expect(salt.length).toBe(32);
    });
  });

  describe("wrapDEK / unwrapDEK", () => {
    it("round-trips: wrap then unwrap returns original DEK", () => {
      const dek = service.generateDEK();
      const kek = service.deriveKEK("password", Buffer.alloc(32, 1));
      const { encrypted, nonce } = service.wrapDEK(kek, dek);
      const unwrapped = service.unwrapDEK(kek, encrypted, nonce);
      expect(hex(unwrapped)).toBe(hex(dek));
    });

    it("unwrap fails with wrong KEK", () => {
      const dek = service.generateDEK();
      const salt = Buffer.alloc(32, 1);
      const kek = service.deriveKEK("correct", salt);
      const wrongKek = service.deriveKEK("wrong", salt);
      const { encrypted, nonce } = service.wrapDEK(kek, dek);
      expect(() => service.unwrapDEK(wrongKek, encrypted, nonce)).toThrow();
    });
  });

  describe("encrypt / decrypt", () => {
    it("round-trips plaintext data", () => {
      const dek = service.generateDEK();
      const plaintext = Buffer.from("Hello, World!");
      const blob = service.encrypt(dek, plaintext);
      const decrypted = service.decrypt(dek, blob);
      expect(hex(decrypted)).toBe(hex(plaintext));
    });

    it("produces different ciphertext each time (unique nonce)", () => {
      const dek = service.generateDEK();
      const plaintext = Buffer.from("same data");
      const blob1 = service.encrypt(dek, plaintext);
      const blob2 = service.encrypt(dek, plaintext);
      expect(hex(blob1)).not.toBe(hex(blob2));
    });

    it("decrypt fails with wrong DEK", () => {
      const dek1 = service.generateDEK();
      const dek2 = service.generateDEK();
      const blob = service.encrypt(dek1, Buffer.from("secret"));
      expect(() => service.decrypt(dek2, blob)).toThrow();
    });

    it("handles empty data", () => {
      const dek = service.generateDEK();
      const blob = service.encrypt(dek, Buffer.alloc(0));
      const decrypted = service.decrypt(dek, blob);
      expect(decrypted.length).toBe(0);
    });

    it("handles large data (1MB)", () => {
      const dek = service.generateDEK();
      const bigData = Buffer.alloc(1024 * 1024, 0xab);
      const blob = service.encrypt(dek, bigData);
      const decrypted = service.decrypt(dek, blob);
      expect(hex(decrypted)).toBe(hex(bigData));
    });
  });
});
