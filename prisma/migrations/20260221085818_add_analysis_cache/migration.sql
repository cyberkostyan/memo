-- CreateTable
CREATE TABLE "AnalysisCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "focusHash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalysisCache_userId_idx" ON "AnalysisCache"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisCache_userId_periodStart_periodEnd_focusHash_key" ON "AnalysisCache"("userId", "periodStart", "periodEnd", "focusHash");

-- AddForeignKey
ALTER TABLE "AnalysisCache" ADD CONSTRAINT "AnalysisCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
