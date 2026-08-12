-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "salaryCurrency" TEXT NOT NULL DEFAULT 'USD',
    "countryCode" TEXT,
    "sponsorshipSignal" TEXT,
    "source" TEXT NOT NULL DEFAULT 'company_scrape',
    "postedAt" DATETIME,
    "scrapedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Job_companySlug_fkey" FOREIGN KEY ("companySlug") REFERENCES "Company" ("slug") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Job" ("companySlug", "description", "externalId", "id", "location", "postedAt", "salaryMax", "salaryMin", "scrapedAt", "source", "sponsorshipSignal", "title", "url") SELECT "companySlug", "description", "externalId", "id", "location", "postedAt", "salaryMax", "salaryMin", "scrapedAt", "source", "sponsorshipSignal", "title", "url" FROM "Job";
DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";
CREATE UNIQUE INDEX "Job_externalId_companySlug_key" ON "Job"("externalId", "companySlug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
