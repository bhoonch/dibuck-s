-- AlterEnum: 토스 호출 전에 먼저 적는 자리 — 승인 직후·기록 전에 죽어도 주문번호가 남는다
ALTER TYPE "PaymentStatus" ADD VALUE 'PENDING' BEFORE 'PAID';
