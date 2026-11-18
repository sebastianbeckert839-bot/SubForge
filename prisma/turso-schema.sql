-- SubForge schema for Turso (libSQL) — used only for usage stats on serverless
-- deploys (Vercel). Run once against your Turso database:
--   turso db shell <database-name> < prisma/turso-schema.sql

-- CreateTable
CREATE TABLE "ToolUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tool" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PageView" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ToolUsage_tool_key" ON "ToolUsage"("tool");

-- CreateIndex
CREATE UNIQUE INDEX "PageView_day_key" ON "PageView"("day");
