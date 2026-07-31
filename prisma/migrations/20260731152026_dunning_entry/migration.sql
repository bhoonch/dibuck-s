-- CreateTable
CREATE TABLE "DunningEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "docId" TEXT NOT NULL,
    "dong" TEXT NOT NULL,
    "ho" TEXT NOT NULL,
    "name" TEXT,
    "amount" INTEGER NOT NULL,
    "period" TEXT,
    "stage" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DunningEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DunningEntry_tenantId_dong_ho_idx" ON "DunningEntry"("tenantId", "dong", "ho");

-- AddForeignKey
ALTER TABLE "DunningEntry" ADD CONSTRAINT "DunningEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DunningEntry" ADD CONSTRAINT "DunningEntry_docId_fkey" FOREIGN KEY ("docId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
