-- CreateTable
CREATE TABLE "Deployment" (
    "id" TEXT NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "branch" TEXT NOT NULL DEFAULT 'main',
    "commitSha" TEXT NOT NULL,
    "commitShortSha" TEXT NOT NULL,
    "commitMessage" TEXT NOT NULL,
    "commitAuthor" TEXT,
    "startedById" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "services" TEXT[] DEFAULT ARRAY['nexaflow']::TEXT[],
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER,
    "errorSummary" TEXT,
    "logs" TEXT,
    "healthCheckedAt" TIMESTAMP(3),
    "healthStatus" TEXT,
    "isRollback" BOOLEAN NOT NULL DEFAULT false,
    "rollbackFromSha" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deployment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Deployment_environment_createdAt_idx" ON "Deployment"("environment", "createdAt");

-- CreateIndex
CREATE INDEX "Deployment_status_idx" ON "Deployment"("status");

-- AddForeignKey
ALTER TABLE "Deployment" ADD CONSTRAINT "Deployment_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
