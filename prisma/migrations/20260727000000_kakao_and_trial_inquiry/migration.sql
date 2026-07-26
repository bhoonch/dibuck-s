-- DropForeignKey
ALTER TABLE "Inquiry" DROP CONSTRAINT "Inquiry_tenantId_fkey";

-- AlterTable
ALTER TABLE "Inquiry" ADD COLUMN     "contact" TEXT,
ALTER COLUMN "tenantId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "kakaoId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_kakaoId_key" ON "User"("kakaoId");

-- AddForeignKey
ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
