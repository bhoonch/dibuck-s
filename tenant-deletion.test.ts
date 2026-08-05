/**
 * 탈퇴 유예 계산 + 실제 purge 검증 — `npx tsx tenant-deletion.test.ts` (purge 부분은 DB 필요)
 * 즉시 삭제를 유예로 바꾼 뒤로 "며칠 남았나"가 배너와 크론 양쪽의 기준이 된다.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { db } from "./src/lib/db";
import {
  DELETE_GRACE_DAYS,
  graceDaysLeft,
  purgeExpiredTenants,
} from "./src/lib/tenant-deletion";

const day = 86400000;
const now = new Date("2026-08-01T00:00:00Z");
const ago = (d: number) => new Date(now.getTime() - d * day);

assert.equal(graceDaysLeft(now, now), DELETE_GRACE_DAYS); // 방금 신청 = 30일 남음
assert.equal(graceDaysLeft(ago(1), now), 29);
assert.equal(graceDaysLeft(ago(29.5), now), 1);
assert.equal(graceDaysLeft(ago(30), now), 0);
assert.equal(graceDaysLeft(ago(45), now), 0); // 음수로 내려가지 않는다

// ── purge: 단지는 지워도 결제 기록(Payment)은 남긴다 ──
// 결제 이력은 회계 증빙(세무·분쟁 근거)이다 — 단지가 나갔다고 지우면
// "돈은 받았는데 근거가 없다"가 된다. 개인정보가 아니라 보존이 맞다.
const T = "test-tenant-purge";

async function cleanup() {
  await db.payment.deleteMany({ where: { tenantId: T } });
  await db.billing.deleteMany({ where: { tenantId: T } });
  await db.inspectionItem.deleteMany({ where: { tenantId: T } });
  await db.tenant.deleteMany({ where: { id: T } });
}

async function main() {
  await cleanup();
  await db.tenant.create({
    data: { id: T, name: "탈퇴테스트단지", deleteRequestedAt: ago(31) },
  });
  await db.billing.create({ data: { tenantId: T, customerKey: "ck-purge" } });
  // 점검 항목도 purge 대상 — TrainingStaff 때처럼 빠뜨리면 FK가 tenant 삭제를 막는다
  await db.inspectionItem.create({
    data: {
      tenantId: T,
      name: "승강기 자체점검",
      legalBasis: "승강기 안전관리법 제31조",
      cycleType: "MONTHLY",
    },
  });
  await db.payment.create({
    data: {
      tenantId: T,
      orderId: "order-purge-keep",
      amount: 30000,
      status: "PAID",
      items: [{ moduleId: "m", name: "테스트모듈", price: 30000 }],
      periodStart: ago(31),
      periodEnd: ago(1),
    },
  });

  assert.equal(await purgeExpiredTenants(new Date(now)), 1, "유예가 끝난 단지는 지워진다");
  assert.equal(await db.tenant.findUnique({ where: { id: T } }), null);
  assert.equal(await db.billing.findUnique({ where: { tenantId: T } }), null);
  assert.equal(await db.inspectionItem.count({ where: { tenantId: T } }), 0);
  assert.equal(
    await db.payment.count({ where: { tenantId: T } }),
    1,
    "결제 기록은 purge 후에도 남는다 — 회계 증빙",
  );

  console.log("✓ 탈퇴 유예 계산 + purge(결제 기록 보존) 통과");
}

main()
  .finally(cleanup)
  .finally(() => db.$disconnect());
