// scripts/migrate-encrypt.ts
import { PrismaClient } from "@prisma/client";
import { EncryptionService } from "../packages/api/src/encryption/encryption.service";
import * as readline from "readline";

async function main() {
  const prisma = new PrismaClient();
  const enc = new EncryptionService();

  const password = await askPassword("Enter user password for encryption: ");

  try {
    const users = await prisma.user.findMany();
    if (users.length === 0) {
      console.log("No users found. Nothing to migrate.");
      return;
    }

    for (const user of users) {
      if (user.encryptionSalt) {
        console.log(`User ${user.email} already has encryption keys. Skipping.`);
        continue;
      }

      console.log(`Migrating user: ${user.email}`);

      // Generate encryption keys
      const salt = enc.generateSalt();
      const dek = enc.generateDEK();
      const kek = enc.deriveKEK(password, salt);
      const { encrypted: encryptedDEK, nonce: dekNonce } = enc.wrapDEK(kek, dek);

      // Update user with encryption keys
      await prisma.user.update({
        where: { id: user.id },
        data: { encryptionSalt: salt, encryptedDEK, dekNonce },
      });

      // Encrypt all events
      const events = await prisma.event.findMany({ where: { userId: user.id } });
      console.log(`  Encrypting ${events.length} events...`);
      for (const event of events) {
        const data: any = {};
        if (event.details) {
          // After migration, details is Bytes -- but existing data was converted from JSON by Prisma migration
          // It may come as Buffer with the JSON string representation
          const detailsStr = Buffer.isBuffer(event.details)
            ? event.details.toString("utf8")
            : JSON.stringify(event.details);
          data.details = enc.encrypt(dek, Buffer.from(detailsStr, "utf8"));
        }
        if (event.note) {
          const noteStr = Buffer.isBuffer(event.note)
            ? event.note.toString("utf8")
            : String(event.note);
          data.note = enc.encrypt(dek, Buffer.from(noteStr, "utf8"));
        }
        if (Object.keys(data).length > 0) {
          await prisma.event.update({ where: { id: event.id }, data });
        }
      }

      // Encrypt all attachments
      const attachments = await prisma.attachment.findMany({
        where: { event: { userId: user.id } },
      });
      console.log(`  Encrypting ${attachments.length} attachments...`);
      for (const att of attachments) {
        const encryptedData = enc.encrypt(dek, Buffer.from(att.data));
        await prisma.attachment.update({
          where: { id: att.id },
          data: { data: encryptedData },
        });
      }

      // Encrypt all analysis cache entries
      const caches = await prisma.analysisCache.findMany({
        where: { userId: user.id },
      });
      console.log(`  Encrypting ${caches.length} analysis cache entries...`);
      for (const cache of caches) {
        const resultStr = Buffer.isBuffer(cache.result)
          ? cache.result.toString("utf8")
          : JSON.stringify(cache.result);
        const encryptedResult = enc.encrypt(dek, Buffer.from(resultStr, "utf8"));
        await prisma.analysisCache.update({
          where: { id: cache.id },
          data: { result: encryptedResult },
        });
      }

      console.log(`  Done! User ${user.email} migrated successfully.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

function askPassword(prompt: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
