-- AlterTable: User - add encryption key fields
ALTER TABLE "User" ADD COLUMN "encryptionSalt" BYTEA,
ADD COLUMN "encryptedDEK" BYTEA,
ADD COLUMN "dekNonce" BYTEA;

-- AlterTable: Event - change details from Json to Bytes, note from String to Bytes
ALTER TABLE "Event" ALTER COLUMN "details" SET DATA TYPE BYTEA USING CASE WHEN "details" IS NOT NULL THEN convert_to("details"::text, 'UTF8') ELSE NULL END;
ALTER TABLE "Event" ALTER COLUMN "note" SET DATA TYPE BYTEA USING CASE WHEN "note" IS NOT NULL THEN convert_to("note", 'UTF8') ELSE NULL END;

-- AlterTable: AnalysisCache - change result from Json to Bytes
ALTER TABLE "AnalysisCache" ALTER COLUMN "result" SET DATA TYPE BYTEA USING convert_to("result"::text, 'UTF8');
