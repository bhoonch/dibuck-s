-- DropForeignKey
ALTER TABLE "DunningEntry" DROP CONSTRAINT "DunningEntry_docId_fkey";

-- CreateIndex
CREATE INDEX "DunningEntry_docId_idx" ON "DunningEntry"("docId");

-- AddForeignKey
ALTER TABLE "DunningEntry" ADD CONSTRAINT "DunningEntry_docId_fkey" FOREIGN KEY ("docId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
