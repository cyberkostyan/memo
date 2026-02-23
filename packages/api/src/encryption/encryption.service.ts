/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from "@nestjs/common";
import * as crypto from "crypto";

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_DIGEST = "sha512";
const KEY_LENGTH = 32; // AES-256
const NONCE_LENGTH = 12; // GCM standard
const TAG_LENGTH = 16; // GCM auth tag
const ALGORITHM = "aes-256-gcm";

/**
 * TS 5.9 + ES2022 makes Buffer and Uint8Array structurally incompatible due to
 * divergent iterator types ([Symbol.dispose] mismatch). Prisma Bytes fields
 * require Uint8Array<ArrayBuffer>. Node crypto APIs return/accept Buffer.
 *
 * We use `as any` at the Buffer ↔ crypto boundary and return Uint8Array<ArrayBuffer>
 * (via copying) in public methods so Prisma is satisfied.
 */

/** Copy data into a fresh Uint8Array<ArrayBuffer> for Prisma compatibility */
function toBytes(data: any): Uint8Array<ArrayBuffer> {
  return new Uint8Array(data) as Uint8Array<ArrayBuffer>;
}

@Injectable()
export class EncryptionService {
  deriveKEK(password: string, salt: Uint8Array): Uint8Array<ArrayBuffer> {
    return toBytes(crypto.pbkdf2Sync(
      password,
      salt as any,
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      PBKDF2_DIGEST,
    ));
  }

  generateDEK(): Uint8Array<ArrayBuffer> {
    return toBytes(crypto.randomBytes(KEY_LENGTH));
  }

  generateSalt(): Uint8Array<ArrayBuffer> {
    return toBytes(crypto.randomBytes(KEY_LENGTH));
  }

  wrapDEK(
    kek: Uint8Array,
    dek: Uint8Array,
  ): { encrypted: Uint8Array<ArrayBuffer>; nonce: Uint8Array<ArrayBuffer> } {
    const nonce = crypto.randomBytes(NONCE_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, kek as any, nonce as any);
    const encrypted = Buffer.concat([cipher.update(dek as any), cipher.final()] as any);
    const tag = cipher.getAuthTag();
    return {
      encrypted: toBytes(Buffer.concat([encrypted, tag] as any)),
      nonce: toBytes(nonce),
    };
  }

  unwrapDEK(
    kek: Uint8Array,
    encrypted: Uint8Array,
    nonce: Uint8Array,
  ): Uint8Array<ArrayBuffer> {
    const buf = Buffer.from(encrypted);
    const ciphertext = buf.subarray(0, buf.length - TAG_LENGTH);
    const tag = buf.subarray(buf.length - TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, kek as any, nonce as any);
    (decipher as any).setAuthTag(tag);
    return toBytes(Buffer.concat([decipher.update(ciphertext as any), decipher.final()] as any));
  }

  /** Returns: nonce (12) || ciphertext || tag (16) */
  encrypt(dek: Uint8Array, plaintext: Uint8Array): Uint8Array<ArrayBuffer> {
    const nonce = crypto.randomBytes(NONCE_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, dek as any, nonce as any);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext as any),
      cipher.final(),
    ] as any);
    const tag = cipher.getAuthTag();
    return toBytes(Buffer.concat([nonce, ciphertext, tag] as any));
  }

  /** Input: nonce (12) || ciphertext || tag (16) */
  decrypt(dek: Uint8Array, blob: Uint8Array): Uint8Array<ArrayBuffer> {
    const buf = Buffer.from(blob);
    const nonce = buf.subarray(0, NONCE_LENGTH);
    const tag = buf.subarray(buf.length - TAG_LENGTH);
    const ciphertext = buf.subarray(NONCE_LENGTH, buf.length - TAG_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, dek as any, nonce as any);
    (decipher as any).setAuthTag(tag);
    return toBytes(Buffer.concat([decipher.update(ciphertext as any), decipher.final()] as any));
  }
}
