-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Company" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "careersUrl" TEXT NOT NULL,
    "atsType" TEXT NOT NULL DEFAULT 'greenhouse',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "lastFailureReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Company" ("active", "atsType", "careersUrl", "createdAt", "id", "name", "slug") SELECT "active", "atsType", "careersUrl", "createdAt", "id", "name", "slug" FROM "Company";
DROP TABLE "Company";
ALTER TABLE "new_Company" RENAME TO "Company";
CREATE UNIQUE INDEX "Company_name_key" ON "Company"("name");
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");
CREATE TABLE "new_Job" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "externalId" TEXT NOT NULL,
    "companySlug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "sponsorshipSignal" TEXT,
    "source" TEXT NOT NULL DEFAULT 'company_scrape',
    "postedAt" DATETIME,
    "scrapedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Job_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "Company" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Job" ("companySlug", "description", "externalId", "id", "location", "postedAt", "scrapedAt", "title", "url") SELECT "companySlug", "description", "externalId", "id", "location", "postedAt", "scrapedAt", "title", "url" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
CREATE UNIQUE INDEX "Job_externalId_companySlug_key" ON "Job"("externalId", "companySlug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
