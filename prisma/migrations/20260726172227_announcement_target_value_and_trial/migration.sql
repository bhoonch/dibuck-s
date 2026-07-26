-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "targetValue" TEXT;

-- AlterTable
ALTER TABLE "TenantModule" ADD COLUMN     "trialEndsAt" TIMESTAMP(3);
