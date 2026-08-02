-- Payment는 회계 증빙(세무·분쟁 근거) — 단지 탈퇴(purge)가 Billing·Tenant를 지운 뒤에도
-- 남아야 하므로 Billing과의 FK(cascade)를 끊는다. 조회는 @@index([tenantId, createdAt])로 충분.
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_tenantId_fkey";
