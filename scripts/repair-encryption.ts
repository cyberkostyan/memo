// scripts/repair-encryption.ts
// Repairs data corrupted by Buffer.isBuffer() bug in setupEncryption.
//
// The bug: Prisma 6 returns Bytes as Uint8Array, but setupEncryption used
// Buffer.isBuffer() which returns false for Uint8Array, causing:
//   - JSON.stringify(uint8Array) → {"0":87,"1":105,...} for details
//   - String(uint8Array) → "87,105,116,104,..." for note
// These mangled strings were then encrypted and stored.
//
// This script: decrypt → detect mangled data → recover original → re-encrypt.

import { PrismaClient } from "@prisma/client";
import { EncryptionService } from "../packages/api/src/encryption/encryption.service";
import * as readline from "readline";

function askPassword(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

/** Detect if a parsed object is a mangled Uint8Array: {"0":87,"1":105,...} */
function isMangledUint8Array(obj: unknown): obj is Record<string, number> {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  if (keys.length === 0) return false;
  return keys.every((k, i) => k === String(i) && typeof (obj as any)[k] === "number");
}

/** Recover original UTF-8 string from mangled Uint8Array object {"0":87,"1":105,...} */
function recoverFromMangledObject(obj: Record<string, number>): string {
  const keys = Object.keys(obj).sort((a, b) => Number(a) - Number(b));
  const bytes = new Uint8Array(keys.map((k) => obj[k]));
  return Buffer.from(bytes).toString("utf8");
}

/** Detect if a string is a mangled note: "87,105,116,104,..." */
function isMangledNoteString(str: string): boolean {
  return /^\d+(,\d+)+$/.test(str) && str.split(",").every((n) => {
    const num = Number(n);
    return Number.isInteger(num) && num >= 0 && num <= 255;
  });
}

/** Recover original UTF-8 string from mangled note "87,105,116,104,..." */
function recoverFromMangledNote(str: string): string {
  const bytes = new Uint8Array(str.split(",").map(Number));
  return Buffer.from(bytes).toString("utf8");
}

async function main() {
  const prisma = new PrismaClient();
  const enc = new EncryptionService();

  const password = await askPassword("Enter user password: ");

  try {
    const users = await prisma.user.findMany();

    for (const user of users) {
      if (!user.encryptionSalt || !user.encryptedDEK || !user.dekNonce) {
        console.log(`User ${user.email}: no encryption keys, skipping.`);
        continue;
      }

      console.log(`\nRepairing user: ${user.email}`);

      // Derive DEK
      const kek = enc.deriveKEK(password, new Uint8Array(user.encryptionSalt));
      const dek = enc.unwrapDEK(kek, new Uint8Array(user.encryptedDEK), new Uint8Array(user.dekNonce));

      // Repair events
      const events = await prisma.event.findMany({ where: { userId: user.id } });
      let fixedDetails = 0;
      let fixedNotes = 0;

      for (const event of events) {
        const updates: any = {};

        // Repair details
        if (event.details) {
          try {
            const decrypted = enc.decrypt(dek, new Uint8Array(event.details));
            const str = Buffer.from(decrypted).toString("utf8");
            const parsed = JSON.parse(str);

            if (isMangledUint8Array(parsed)) {
              const originalJson = recoverFromMangledObject(parsed);
              // Verify it's valid JSON
              JSON.parse(originalJson);
              updates.details = enc.encrypt(dek, new Uint8Array(Buffer.from(originalJson, "utf8")));
              fixedDetails++;
              console.log(`  Event ${event.id}: details repaired`);
            }
          } catch (err) {
            console.log(`  Event ${event.id}: details decrypt/repair failed: ${(err as Error).message}`);
          }
        }

        // Repair note
        if (event.note) {
          try {
            const decrypted = enc.decrypt(dek, new Uint8Array(event.note));
            const str = Buffer.from(decrypted).toString("utf8");

            if (isMangledNoteString(str)) {
              const originalNote = recoverFromMangledNote(str);
              updates.note = enc.encrypt(dek, new Uint8Array(Buffer.from(originalNote, "utf8")));
              fixedNotes++;
              console.log(`  Event ${event.id}: note repaired`);
            }
          } catch (err) {
            console.log(`  Event ${event.id}: note decrypt/repair failed: ${(err as Error).message}`);
          }
        }

        if (Object.keys(updates).length > 0) {
          await prisma.event.update({ where: { id: event.id }, data: updates });
        }
      }

      // Repair analysis cache
      const caches = await prisma.analysisCache.findMany({ where: { userId: user.id } });
      let fixedCaches = 0;

      for (const cache of caches) {
        try {
          const decrypted = enc.decrypt(dek, new Uint8Array(cache.result));
          const str = Buffer.from(decrypted).toString("utf8");
          const parsed = JSON.parse(str);

          if (isMangledUint8Array(parsed)) {
            const originalJson = recoverFromMangledObject(parsed);
            JSON.parse(originalJson); // verify valid JSON
            const reEncrypted = enc.encrypt(dek, new Uint8Array(Buffer.from(originalJson, "utf8")));
            await prisma.analysisCache.update({
              where: { id: cache.id },
              data: { result: reEncrypted },
            });
            fixedCaches++;
            console.log(`  AnalysisCache ${cache.id}: repaired`);
          }
        } catch (err) {
          console.log(`  AnalysisCache ${cache.id}: decrypt/repair failed: ${(err as Error).message}`);
        }
      }

      console.log(`\nRepair summary for ${user.email}:`);
      console.log(`  Events: ${fixedDetails} details fixed, ${fixedNotes} notes fixed (out of ${events.length} events)`);
      console.log(`  AnalysisCache: ${fixedCaches} fixed (out of ${caches.length} entries)`);
    }

    console.log("\nDone!");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Repair failed:", err);
  process.exit(1);
});
