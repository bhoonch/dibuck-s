/**
 * 모듈 노출 규칙 검증 — `npx tsx modules.test.ts` (DB 필요)
 *
 * 규칙: isActive=false는 "신규 판매 중단"이지 "기존 구독 회수"가 아니다.
 * 임시 단지·임시 모듈을 만들어 확인하고 끝나면 지운다.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { db } from "./src/lib/db";
import { getModulesForTenant, isSubscribed } from "./src/lib/modules";

const TENANT = "test-tenant-modules";
const SOLD = "test-mod-sold";
const RETIRED = "test-mod-retired";

async function cleanup() {
  await db.tenantModule.deleteMany({ where: { tenantId: TENANT } });
  await db.tenant.deleteMany({ where: { id: TENANT } });
  await db.module.deleteMany({ where: { id: { in: [SOLD, RETIRED] } } });
}

async function main() {
  await cleanup();
  await db.tenant.create({ data: { id: TENANT, name: "테스트단지" } });
  for (const [id, isActive] of [
    [SOLD, true],
    [RETIRED, false],
  ] as const) {
    await db.module.create({
      data: {
        id,
        name: id,
        description: "",
        icon: "Wrench",
        route: `/modules/${id}`,
        price: 10000,
        sortOrder: 900,
        isActive,
        trialDays: 0,
      },
    });
  }

  const ids = async () =>
    new Map((await getModulesForTenant(TENANT)).map((m) => [m.id, m]));

  // 1. 구독한 적 없으면 판매 중단 모듈은 아예 안 보인다
  let list = await ids();
  assert.ok(list.has(SOLD), "판매 중인 모듈은 보여야 한다");
  assert.equal(list.has(RETIRED), false, "미구독 + 판매 중단은 감춰야 한다");
  assert.equal(
    await isSubscribed(TENANT, RETIRED),
    false,
    "미구독이면 모듈 페이지 진입 불가",
  );

  // 2. 이미 구독 중이면 판매 중단이어도 계속 보이고 쓸 수 있어야 한다
  await db.tenantModule.create({
    data: { tenantId: TENANT, moduleId: RETIRED, status: "ACTIVE" },
  });
  list = await ids();
  assert.ok(list.has(RETIRED), "구독 중이면 판매 중단이어도 보여야 한다");
  assert.equal(list.get(RETIRED)!.retired, true, "판매 중단 표시가 있어야 한다");
  assert.equal(list.get(RETIRED)!.subscribed, true, "계속 사용 중이어야 한다");
  assert.equal(
    await isSubscribed(TENANT, RETIRED),
    true,
    "기존 구독자는 모듈 페이지에 들어갈 수 있어야 한다",
  );

  // 3. 해지하면 목록에서 사라지고 다시 들어갈 수 없다
  await db.tenantModule.update({
    where: { tenantId_moduleId: { tenantId: TENANT, moduleId: RETIRED } },
    data: { status: "CANCELED" },
  });
  list = await ids();
  assert.equal(list.has(RETIRED), false, "해지하면 다시 감춰져야 한다");
  assert.equal(await isSubscribed(TENANT, RETIRED), false);

  // 4. 판매 중인 모듈은 해지해도 목록에 남는다 (다시 구독할 수 있어야 하니까)
  await db.tenantModule.create({
    data: { tenantId: TENANT, moduleId: SOLD, status: "CANCELED" },
  });
  list = await ids();
  assert.ok(list.has(SOLD), "판매 중이면 해지해도 목록에 남아야 한다");
  assert.equal(list.get(SOLD)!.subscribed, false);
  assert.equal(list.get(SOLD)!.retired, false);

  console.log("modules OK");
}

main()
  .finally(cleanup)
  .finally(() => db.$disconnect());
