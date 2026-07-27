/**
 * 결재 상태 전이 실동작 검증 — `npx tsx approval-run.test.ts` (DB 필요)
 * 상신 → 순차 승인 → 외부 토큰 승인 → 완료, 그리고 반려 → 재상신 경로.
 * 임시 단지를 만들어 돌리고 끝나면 지운다.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./src/generated/prisma/client";
import { actOnStep, submitDocument } from "./src/lib/gian/approval";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  // ── 픽스처: 임시 단지 + 직원 2명 + 회장 + 품의 문서 ──
  const tenant = await db.tenant.create({
    data: {
      name: "결재테스트단지",
      externalApprovers: [{ role: "CHAIR", name: "홍회장" }],
    },
  });
  const [staff, director] = await Promise.all([
    db.user.create({
      data: {
        email: `approval-test-staff-${Date.now()}@test.local`,
        name: "김담당",
        role: "STAFF",
        tenantId: tenant.id,
        passwordHash: "x",
      },
    }),
    db.user.create({
      data: {
        email: `approval-test-director-${Date.now()}@test.local`,
        name: "이소장",
        role: "DIRECTOR",
        tenantId: tenant.id,
        passwordHash: "x",
      },
    }),
  ]);
  await db.tenant.update({
    where: { id: tenant.id },
    data: { approvalLine: [staff.id, director.id] },
  });

  const cls = {
    docType: "pumui",
    context: "direct",
    amountRaw: 4_500_000,
    vatIncluded: true,
    vatExcluded: 4_090_909,
    isLtp: false,
    externalApprovers: ["CHAIR"],
  };
  const draft = {
    title: "테스트 공사 지출품의의 건",
    legalBasis: ["공동주택관리법 제63조"],
    sections: [{ heading: "품의목적", lines: ["가. 테스트"] }],
    attachments: [],
    legalNotices: [],
    needsClarification: [],
  };
  const doc = await db.document.create({
    data: {
      tenantId: tenant.id,
      moduleId: "approvals",
      type: "approval",
      title: draft.title,
      status: "draft",
      createdById: staff.id,
      meta: { cls, draft, plannedSteps: [] },
    },
  });

  try {
    // ── 상신: 결재선 스냅샷 2(내부) + 회장 = 3단, 1번만 pending ──
    assert.deepEqual(await submitDocument(doc.id, staff.id), {});
    let steps = await db.approvalStep.findMany({
      where: { documentId: doc.id },
      orderBy: { order: "asc" },
    });
    assert.equal(steps.length, 3);
    assert.deepEqual(steps.map((s) => s.status), ["pending", "waiting", "waiting"]);
    assert.equal(steps[2].externalRole, "CHAIR");
    assert.equal((await db.document.findUniqueOrThrow({ where: { id: doc.id } })).status, "pending");
    // 1번 결재자에게 알림이 갔다
    assert.equal(
      await db.notification.count({
        where: { userId: staff.id, type: "approval_request" },
      }),
      1,
    );

    // ── 이중 상신 방지 ──
    assert.ok((await submitDocument(doc.id, staff.id)).error);

    // ── 1번 반려 → 문서 rejected + 기안자 알림 ──
    assert.deepEqual(await actOnStep(steps[0].id, "reject", "예산 근거 부족"), { done: true });
    assert.equal((await db.document.findUniqueOrThrow({ where: { id: doc.id } })).status, "rejected");
    assert.equal(
      await db.notification.count({ where: { userId: staff.id, type: "approval_rejected" } }),
      1,
    );
    // 이중 처리 방지 — 같은 단계 재승인 불가
    assert.ok((await actOnStep(steps[0].id, "approve", "")).error);

    // ── 재상신: 스텝이 새로 깔린다 ──
    assert.deepEqual(await submitDocument(doc.id, staff.id), {});
    steps = await db.approvalStep.findMany({
      where: { documentId: doc.id },
      orderBy: { order: "asc" },
    });
    assert.equal(steps.length, 3);
    assert.deepEqual(steps.map((s) => s.status), ["pending", "waiting", "waiting"]);

    // ── 순차 승인: 1 → 2 → 외부(회장) 토큰 발급 확인 ──
    assert.deepEqual(await actOnStep(steps[0].id, "approve", ""), {});
    const s2 = await db.approvalStep.findUniqueOrThrow({ where: { id: steps[1].id } });
    assert.equal(s2.status, "pending"); // 다음 차례로 넘어갔다
    assert.deepEqual(await actOnStep(steps[1].id, "approve", "검토 완료"), {});
    const chair = await db.approvalStep.findUniqueOrThrow({ where: { id: steps[2].id } });
    assert.equal(chair.status, "pending");
    assert.ok(chair.token, "외부 결재자 차례에 토큰이 발급돼야 한다");
    assert.ok(chair.tokenExpiresAt! > new Date());

    // ── 외부(회장) 승인 → 문서 final + 완료 알림 ──
    assert.deepEqual(await actOnStep(chair.id, "approve", ""), { done: true });
    assert.equal((await db.document.findUniqueOrThrow({ where: { id: doc.id } })).status, "final");
    assert.equal(
      await db.notification.count({ where: { userId: staff.id, type: "approval_done" } }),
      1,
    );

    // ── 완료 문서에는 어떤 결재도 불가 ──
    assert.ok((await actOnStep(chair.id, "approve", "")).error);

    console.log("approval-run OK");
  } finally {
    // 정리 — ApprovalStep·Notification은 cascade, 문서·유저·단지는 직접
    await db.document.deleteMany({ where: { tenantId: tenant.id } });
    await db.notification.deleteMany({ where: { tenantId: tenant.id } });
    await db.user.deleteMany({ where: { tenantId: tenant.id } });
    await db.tenant.delete({ where: { id: tenant.id } });
  }
}

main().finally(() => db.$disconnect());
