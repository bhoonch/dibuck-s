/**
 * 청구 상태 전이 검증 — `npx tsx billing-run.test.ts` (DB 필요)
 *
 * 토스 키가 없는 환경에서는 결제가 실패하므로 유예·재시도 경로가 그대로 검증된다.
 * 임시 단지·모듈을 만들어 확인하고 끝나면 지운다.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { db } from "./src/lib/db";
import {
  chargeTenant,
  reconcileLastFailure,
  suspendTenant,
} from "./src/lib/billing-run";
import { ymdKst } from "./src/lib/utils";

const T = "test-tenant-billing";
const M = "test-mod-billing";

async function cleanup() {
  await db.payment.deleteMany({ where: { tenantId: T } });
  await db.tenantModule.deleteMany({ where: { tenantId: T } });
  await db.billing.deleteMany({ where: { tenantId: T } });
  await db.user.deleteMany({ where: { tenantId: T } });
  await db.tenant.deleteMany({ where: { id: T } });
  await db.module.deleteMany({ where: { id: M } });
}

async function main() {
  await cleanup();
  await db.tenant.create({ data: { id: T, name: "결제테스트단지" } });
  await db.module.create({
    data: { id: M, name: "테스트모듈", description: "", icon: "Wrench",
      route: `/modules/${M}`, price: 30000, sortOrder: 900, trialDays: 30 },
  });
  await db.billing.create({
    data: { tenantId: T, customerKey: "ck-test", billingKey: "bk-test", status: "ACTIVE" },
  });

  // 1) 전부 체험 중 → 결제하지 않고 체험 종료일이 첫 청구일
  const trialEnd = new Date(Date.now() + 10 * 86400000);
  await db.tenantModule.create({
    data: { tenantId: T, moduleId: M, status: "ACTIVE", trialEndsAt: trialEnd },
  });
  let r = await chargeTenant(T);
  assert.deepEqual(r, { ok: true, amount: 0 }, "체험 중이면 청구하지 않는다");
  let b = await db.billing.findUniqueOrThrow({ where: { tenantId: T } });
  assert.equal(
    ymdKst(b.nextBillingAt!),
    ymdKst(trialEnd),
    "첫 청구일은 체험 종료일이어야 한다",
  );
  assert.equal(await db.payment.count({ where: { tenantId: T } }), 0, "0원 청구는 이력을 남기지 않는다");

  // 1.5) 청구일이 아직 안 왔으면 결제하지 않는다 — 카드 변경 콜백·오래된 탭의
  // "지금 결제하기"가 이미 결제한 기간을 다시 결제하는 사고를 막는 입구 검사
  await db.tenantModule.update({
    where: { tenantId_moduleId: { tenantId: T, moduleId: M } },
    data: { trialEndsAt: new Date(Date.now() - 86400000) },
  });
  r = await chargeTenant(T); // nextBillingAt은 아직 10일 뒤(체험 종료일)
  assert.deepEqual(r, { ok: true, amount: 0 }, "청구일 전에는 결제하지 않는다");
  assert.equal(
    await db.payment.count({ where: { tenantId: T } }),
    0,
    "청구일 전 호출은 결제 이력을 남기면 안 된다",
  );

  // 2) 청구일 도래 → 유료 청구 시도. 토스 키가 없으니 실패 경로를 탄다
  await db.billing.update({
    where: { tenantId: T },
    data: { nextBillingAt: new Date(Date.now() - 86400000) },
  });
  r = await chargeTenant(T);
  assert.equal(r.ok, false, "결제 실패해야 한다(키 없음)");
  b = await db.billing.findUniqueOrThrow({ where: { tenantId: T } });
  assert.equal(b.status, "PAST_DUE", "실패하면 PAST_DUE");
  assert.ok(b.pastDueSince, "유예 시작 시각이 찍혀야 한다");
  const firstFailure = b.pastDueSince!;
  const p = await db.payment.findFirstOrThrow({ where: { tenantId: T } });
  assert.equal(p.status, "FAILED");
  assert.equal(p.amount, 30000, "가격 스냅샷이 남아야 한다");
  assert.deepEqual(p.items, [{ moduleId: M, name: "테스트모듈", price: 30000 }]);

  // 3) 재시도해도 유예 시작 시각은 그대로여야 한다 (아니면 유예가 영원히 안 끝난다)
  r = await chargeTenant(T);
  b = await db.billing.findUniqueOrThrow({ where: { tenantId: T } });
  assert.equal(
    b.pastDueSince!.getTime(),
    firstFailure.getTime(),
    "재시도가 유예 시작 시각을 밀면 안 된다",
  );
  assert.equal(await db.payment.count({ where: { tenantId: T } }), 2, "시도마다 이력이 쌓인다");

  // 3.5) 대사 — 실패로 적힌 마지막 시도가 사실은 승인됐던 경우.
  // 이 복구가 없으면 내일 새 주문번호로 같은 기간을 한 번 더 결제한다(이중 출금).
  const failed = await db.payment.findFirstOrThrow({
    where: { tenantId: T },
    orderBy: { createdAt: "desc" },
  });
  // 승인된 적 없다고 답하면 아무것도 건드리지 않는다
  assert.equal(await reconcileLastFailure(T, async () => null), null);
  b = await db.billing.findUniqueOrThrow({ where: { tenantId: T } });
  assert.equal(b.status, "PAST_DUE", "대사에서 못 찾으면 상태는 그대로다");

  const recovered = await reconcileLastFailure(T, async (orderId) => {
    assert.equal(orderId, failed.orderId, "대사는 마지막 시도의 주문번호로 묻는다");
    return {
      paymentKey: "pk-recovered",
      orderId,
      totalAmount: 30000,
      status: "DONE",
      receipt: { url: "https://receipt.example/1" },
    };
  });
  assert.equal(recovered?.status, "PAID", "승인돼 있었다면 결제로 고쳐 적는다");
  assert.equal(recovered?.paymentKey, "pk-recovered");
  assert.equal(recovered?.failReason, null, "실패 사유는 지운다");
  b = await db.billing.findUniqueOrThrow({ where: { tenantId: T } });
  assert.equal(b.status, "ACTIVE", "결제된 것이므로 연체가 아니다");
  assert.equal(b.pastDueSince, null);
  assert.equal(
    b.nextBillingAt!.getTime(),
    failed.periodEnd.getTime(),
    "다음 청구일은 그때 계산한 기간 끝 — 오늘 기준으로 다시 잡으면 하루씩 밀린다",
  );
  assert.equal(
    await db.payment.count({ where: { tenantId: T } }),
    2,
    "대사는 새 결제를 만들지 않는다 — 있던 행을 고친다",
  );

  // 4) 정지
  await suspendTenant(T);
  b = await db.billing.findUniqueOrThrow({ where: { tenantId: T } });
  assert.equal(b.status, "SUSPENDED");

  // 5) 해지 예약 → 청구일에 결제 대신 실제 해지 (청구일 전에는 실행되지 않는다)
  await db.billing.update({
    where: { tenantId: T },
    data: {
      status: "ACTIVE",
      cancelRequestedAt: new Date(),
      pastDueSince: null,
      nextBillingAt: new Date(Date.now() - 86400000),
    },
  });
  r = await chargeTenant(T);
  assert.deepEqual(r, { ok: true, amount: 0 });
  b = await db.billing.findUniqueOrThrow({ where: { tenantId: T } });
  assert.equal(b.status, "NONE", "해지되면 결제 상태가 초기화된다");
  assert.equal(b.billingKey, null, "더 청구하지 않으므로 카드도 지운다");
  assert.equal(b.nextBillingAt, null);
  const mod = await db.tenantModule.findUniqueOrThrow({
    where: { tenantId_moduleId: { tenantId: T, moduleId: M } },
  });
  assert.equal(mod.status, "CANCELED", "모듈이 실제로 해지돼야 한다");

  // 6) 정지 상태에서도 해지 예약은 실행된다 — 크론이 SUSPENDED를 빼면
  //    "해지될 예정" 안내만 뜬 채 빌링키가 영원히 남는다
  await db.billing.update({
    where: { tenantId: T },
    data: {
      status: "SUSPENDED",
      billingKey: "bk-test",
      cancelRequestedAt: new Date(),
      nextBillingAt: null,
    },
  });
  await db.tenantModule.update({
    where: { tenantId_moduleId: { tenantId: T, moduleId: M } },
    data: { status: "ACTIVE" },
  });
  r = await chargeTenant(T);
  assert.deepEqual(r, { ok: true, amount: 0 });
  b = await db.billing.findUniqueOrThrow({ where: { tenantId: T } });
  assert.equal(b.status, "NONE", "정지 단지의 해지 예약도 실제로 끊긴다");
  assert.equal(b.billingKey, null);

  // 7) 0원 청구는 연체를 세탁하지 않는다 — 모듈 전부 해지 후 "지금 결제하기"를
  //    눌러도 PAST_DUE가 ACTIVE로 둔갑하면 안 된다(죽은 카드 무한 무료의 입구)
  const owedSince = new Date(Date.now() - 2 * 86400000);
  await db.billing.update({
    where: { tenantId: T },
    data: {
      status: "PAST_DUE",
      billingKey: "bk-test",
      cancelRequestedAt: null,
      pastDueSince: owedSince,
      nextBillingAt: new Date(Date.now() - 86400000),
    },
  });
  // 모듈은 6)에서 CANCELED — 청구 금액 0원인 연체 단지가 된다
  r = await chargeTenant(T);
  assert.deepEqual(r, { ok: true, amount: 0 });
  b = await db.billing.findUniqueOrThrow({ where: { tenantId: T } });
  assert.equal(b.status, "PAST_DUE", "0원 청구가 연체를 ACTIVE로 되돌리면 안 된다");
  assert.equal(
    b.pastDueSince!.getTime(),
    owedSince.getTime(),
    "유예 시작 시각도 그대로여야 한다",
  );

  // 8) 탈퇴 신청 = 청구 정지. 이미 낸 기간(청구일 전)은 건드리지 않고,
  //    청구일이 오면 결제 대신 해지한다
  await db.tenant.update({
    where: { id: T },
    data: { deleteRequestedAt: new Date() },
  });
  await db.billing.update({
    where: { tenantId: T },
    data: {
      status: "ACTIVE",
      pastDueSince: null,
      nextBillingAt: new Date(Date.now() + 10 * 86400000),
    },
  });
  await db.tenantModule.update({
    where: { tenantId_moduleId: { tenantId: T, moduleId: M } },
    data: { status: "ACTIVE" },
  });
  r = await chargeTenant(T);
  assert.deepEqual(r, { ok: true, amount: 0 }, "낸 기간이 남았으면 아무 일도 없다");
  let mod2 = await db.tenantModule.findUniqueOrThrow({
    where: { tenantId_moduleId: { tenantId: T, moduleId: M } },
  });
  assert.equal(mod2.status, "ACTIVE", "이미 결제한 기간은 그대로 쓴다");

  await db.billing.update({
    where: { tenantId: T },
    data: { nextBillingAt: new Date(Date.now() - 86400000) },
  });
  r = await chargeTenant(T);
  assert.deepEqual(r, { ok: true, amount: 0 });
  b = await db.billing.findUniqueOrThrow({ where: { tenantId: T } });
  assert.equal(b.status, "NONE", "청구일이 오면 결제 대신 해지된다");
  assert.equal(b.billingKey, null, "지워질 단지의 카드를 쥐고 있지 않는다");
  mod2 = await db.tenantModule.findUniqueOrThrow({
    where: { tenantId_moduleId: { tenantId: T, moduleId: M } },
  });
  assert.equal(mod2.status, "CANCELED");
  assert.equal(
    await db.payment.count({ where: { tenantId: T } }),
    2,
    "6~8 어디서도 새 결제가 생기면 안 된다",
  );

  console.log(
    "billing-run 통과 (무청구 / 실패 유예 / 재시도 / 대사 복구 / 정지 / 해지 예약 / 정지 해지 / 0원 비세탁 / 탈퇴 청구 정지)",
  );
}

main()
  .finally(cleanup)
  .finally(() => db.$disconnect());
