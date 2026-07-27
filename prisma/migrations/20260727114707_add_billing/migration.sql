-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('NONE', 'ACTIVE', 'PAST_DUE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'FAILED');

-- CreateTable
CREATE TABLE "Billing" (
    "tenantId" TEXT NOT NULL,
    "customerKey" TEXT NOT NULL,
    "billingKey" TEXT,
    "cardCompany" TEXT,
    "cardNumber" TEXT,
    "status" "BillingStatus" NOT NULL DEFAULT 'NONE',
    "nextBillingAt" TIMESTAMP(3),
    "billingDay" INTEGER,
    "pastDueSince" TIMESTAMP(3),
    "cancelRequestedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Billing_pkey" PRIMARY KEY ("tenantId")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "items" JSONB NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "paymentKey" TEXT,
    "receiptUrl" TEXT,
    "failCode" TEXT,
    "failReason" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Billing_customerKey_key" ON "Billing"("customerKey");

-- CreateIndex
CREATE INDEX "Billing_nextBillingAt_idx" ON "Billing"("nextBillingAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_orderId_key" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_createdAt_idx" ON "Payment"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "Billing" ADD CONSTRAINT "Billing_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Billing"("tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
