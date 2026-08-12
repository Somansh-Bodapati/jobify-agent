-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Application" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "resumeVariantId" TEXT,
    "dedupeId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "permanentlySkipped" BOOLEAN NOT NULL DEFAULT false,
    "screenshotPath" TEXT,
    "notes" TEXT,
    "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Application_resumeVariantId_fkey" FOREIGN KEY ("resumeVariantId") REFERENCES "ResumeVariant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Application" ("appliedAt", "dedupeId", "id", "jobId", "notes", "resumeVariantId", "screenshotPath", "status") SELECT "appliedAt", "dedupeId", "id", "jobId", "notes", "resumeVariantId", "screenshotPath", "status" FROM "Application";
DROP TABLE "Application";
ALTER TABLE "new_Application" RENAME TO "Application";
CREATE UNIQUE INDEX "Application_dedupeId_key" ON "Application"("dedupeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
