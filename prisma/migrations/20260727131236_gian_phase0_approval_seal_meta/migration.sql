-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "meta" JSONB;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "externalApprovers" JSONB,
ADD COLUMN     "sealImage" TEXT;

-- CreateTable
CREATE TABLE "ApprovalStep" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "userId" TEXT,
    "externalRole" TEXT,
    "name" TEXT NOT NULL,
    "token" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "comment" TEXT,
    "actedAt" TIMESTAMP(3),

    CONSTRAINT "ApprovalStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalStep_token_key" ON "ApprovalStep"("token");

-- CreateIndex
CREATE INDEX "ApprovalStep_userId_status_idx" ON "ApprovalStep"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalStep_documentId_order_key" ON "ApprovalStep"("documentId", "order");

-- AddForeignKey
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
