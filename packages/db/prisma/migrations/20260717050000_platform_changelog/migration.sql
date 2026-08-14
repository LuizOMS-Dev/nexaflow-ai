-- Changelog / Novidades da plataforma (separado de AuditLog)

CREATE TABLE "PlatformRelease" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "visibility" TEXT NOT NULL DEFAULT 'ALL',
    "publishedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformRelease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformRelease_version_key" ON "PlatformRelease"("version");
CREATE INDEX "PlatformRelease_status_publishedAt_idx" ON "PlatformRelease"("status", "publishedAt");
CREATE INDEX "PlatformRelease_createdAt_idx" ON "PlatformRelease"("createdAt");

CREATE TABLE "PlatformReleaseItem" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlatformReleaseItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlatformReleaseItem_releaseId_sortOrder_idx" ON "PlatformReleaseItem"("releaseId", "sortOrder");

ALTER TABLE "PlatformReleaseItem" ADD CONSTRAINT "PlatformReleaseItem_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "PlatformRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "UserReleaseSeen" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserReleaseSeen_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserReleaseSeen_userId_releaseId_key" ON "UserReleaseSeen"("userId", "releaseId");
CREATE INDEX "UserReleaseSeen_userId_idx" ON "UserReleaseSeen"("userId");
CREATE INDEX "UserReleaseSeen_releaseId_idx" ON "UserReleaseSeen"("releaseId");

ALTER TABLE "UserReleaseSeen" ADD CONSTRAINT "UserReleaseSeen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserReleaseSeen" ADD CONSTRAINT "UserReleaseSeen_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "PlatformRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
