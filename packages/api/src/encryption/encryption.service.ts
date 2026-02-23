import { Injectable } from "@nestjs/common";
import * as crypto from "crypto";

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_DIGEST = "sha512";
const KEY_LENGTH = 32; // AES-256
const NONCE_LENGTH = 12; // GCM standard
const TAG_LENGTH = 16; // GCM auth tag
const ALGORITHM = "aes-256-gcm";

@Injectable()
export class EncryptionService {
  deriveKEK(password: string, salt: Buffer): Buffer {
    return crypto.pbkdf2Sync(
      password,
      salt,
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      PBKDF2_DIGEST,
    );
  }

  generateDEK(): Buffer {
    return crypto.randomBytes(KEY_LENGTH);
  }

  generateSalt(): Buffer {
    return crypto.randomBytes(KEY_LENGTH);
  }

  wrapDEK(kek: Buffer, dek: Buffer): { encrypted: Buffer; nonce: Buffer } {
    const nonce = crypto.randomBytes(NONCE_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, kek, nonce);
    const encrypted = Buffer.concat([cipher.update(dek), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { encrypted: Buffer.concat([encrypted, tag]), nonce };
  }

  unwrapDEK(kek: Buffer, encrypted: Buffer, nonce: Buffer): Buffer {
    const ciphertext = encrypted.subarray(0, encrypted.length - TAG_LENGTH);
    const tag = encrypted.subarray(encrypted.length - TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, kek, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /** Returns: nonce (12) || ciphertext || tag (16) */
  encrypt(dek: Buffer, plaintext: Buffer): Buffer {
    const nonce = crypto.randomBytes(NONCE_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, dek, nonce);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([nonce, ciphertext, tag]);
  }

  /** Input: nonce (12) || ciphertext || tag (16) */
  decrypt(dek: Buffer, blob: Buffer): Buffer {
    const nonce = blob.subarray(0, NONCE_LENGTH);
    const tag = blob.subarray(blob.length - TAG_LENGTH);
    const ciphertext = blob.subarray(NONCE_LENGTH, blob.length - TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, dek, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }
}
