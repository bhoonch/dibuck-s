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
import { createNoticeFrom, findNoticeFor } from "./src/lib/gian/notice";
import { createDocument } from "./src/lib/documents";
import {
  buildReportDraft,
  findFollowupFor,
  followupCls,
  followupDocType,
} from "./src/lib/gian/followup";

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
  const form = {
    work: "지하주차장 배수펌프 교체 공사",
    location: "지하 1층 기계실",
    why: "노후로 인한 잦은 고장",
    schedule: "2026. 08. 10. ~ 08. 12.",
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
      docNo: `품의-2026-${String(Date.now()).slice(-4)}`,
      title: draft.title,
      status: "draft",
      createdById: staff.id,
      meta: { cls, draft, plannedSteps: [], form },
    },
  });

  try {
    // ── 상신: 결재선 스냅샷 2(내부) + 회장 = 3단 ──
    // 1번은 기안자(담당) 칸이라 상신과 동시에 서명 완료, 결재 차례는 2번부터.
    assert.deepEqual(await submitDocument(doc.id, staff.id), {});
    let steps = await db.approvalStep.findMany({
      where: { documentId: doc.id },
      orderBy: { order: "asc" },
    });
    assert.equal(steps.length, 3);
    assert.deepEqual(steps.map((s) => s.status), ["approved", "pending", "waiting"]);
    // 기안자가 설정 결재선에도 있었지만 칸은 하나뿐이다
    assert.equal(steps[0].userId, staff.id);
    assert.ok(steps[0].actedAt, "기안자 칸에는 서명 시각이 찍힌다");
    assert.equal(steps[1].userId, director.id);
    assert.equal(steps[2].externalRole, "CHAIR");
    assert.equal((await db.document.findUniqueOrThrow({ where: { id: doc.id } })).status, "pending");
    // 결재 요청 알림은 기안자가 아니라 다음 결재자에게 간다
    assert.equal(
      await db.notification.count({
        where: { userId: director.id, type: "approval_request" },
      }),
      1,
    );
    assert.equal(
      await db.notification.count({
        where: { userId: staff.id, type: "approval_request" },
      }),
      0,
    );

    // ── 이중 상신 방지 ──
    assert.ok((await submitDocument(doc.id, staff.id)).error);

    // ── 첫 결재자(2번) 반려 → 문서 rejected + 기안자 알림 ──
    assert.deepEqual(await actOnStep(steps[1].id, "reject", "예산 근거 부족"), { done: true });
    assert.equal((await db.document.findUniqueOrThrow({ where: { id: doc.id } })).status, "rejected");
    assert.equal(
      await db.notification.count({ where: { userId: staff.id, type: "approval_rejected" } }),
      1,
    );
    // 이중 처리 방지 — 같은 단계 재승인 불가
    assert.ok((await actOnStep(steps[1].id, "approve", "")).error);

    // ── 재상신: 스텝이 새로 깔린다. 번호는 그대로 — 바뀌면 결재받은 문서와 다른 문서가 된다 ──
    assert.deepEqual(await submitDocument(doc.id, staff.id), {});
    assert.equal(
      (await db.document.findUniqueOrThrow({ where: { id: doc.id } })).docNo,
      doc.docNo,
    );
    steps = await db.approvalStep.findMany({
      where: { documentId: doc.id },
      orderBy: { order: "asc" },
    });
    assert.equal(steps.length, 3);
    // 재상신도 기안자 칸은 다시 서명 완료 상태로 깔린다
    assert.deepEqual(steps.map((s) => s.status), ["approved", "pending", "waiting"]);

    // ── 순차 승인: 2 → 외부(회장) 토큰 발급 확인 ──
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

    // ── 결재 완료 → 입주민 공고문 자동 파생 (승인 전에는 없었어야 한다) ──
    const notices = await db.document.findMany({
      where: { tenantId: tenant.id, type: "notice" },
    });
    assert.equal(notices.length, 1, "결재 완료 시 공고문 1건이 파생돼야 한다");
    const nmeta = notices[0].meta as { sourceDocId: string; notice: { rows: { v: string }[] } };
    assert.equal(nmeta.sourceDocId, doc.id); // 원본과 양방향 링크
    assert.ok(notices[0].docNo!.startsWith("공지-"), "채번 접두사는 공지");
    assert.ok(nmeta.notice.rows.some((r) => r.v.includes(doc.docNo!)), "시행근거에 원본 문서번호");
    // 중복 생성 방지 — 같은 문서로 다시 호출해도 늘지 않는다
    await createNoticeFrom(await db.document.findUniqueOrThrow({ where: { id: doc.id } }));
    assert.equal(await db.document.count({ where: { tenantId: tenant.id, type: "notice" } }), 1);

    // 폐기한 공고문은 없는 것으로 본다 — 잘못 나온 공고문을 버리고 다시 만드는 유일한 경로다
    await db.document.update({ where: { id: notices[0].id }, data: { status: "void" } });
    assert.equal(await findNoticeFor(doc.id), null, "폐기본은 파생 이력으로 치지 않는다");
    // 재생성 공고문의 결재일은 실제 서명 시각이어야 한다 — 마지막 서명을 과거로
    // 돌려놓고 다시 만들어, "지금"이 아니라 그 날짜가 찍히는지 실측한다
    const signedPast = new Date("2026-07-01T03:00:00Z"); // KST 2026-07-01 12:00
    await db.approvalStep.update({
      where: { id: chair.id },
      data: { actedAt: signedPast },
    });
    await createNoticeFrom(await db.document.findUniqueOrThrow({ where: { id: doc.id } }));
    assert.equal(
      await db.document.count({ where: { tenantId: tenant.id, type: "notice" } }),
      2,
      "폐기 후에는 다시 만들어진다(폐기본은 기록으로 남는다)",
    );
    const renotice = await findNoticeFor(doc.id);
    const rmeta = (await db.document.findUniqueOrThrow({ where: { id: renotice!.id } }))
      .meta as { notice: { rows: { v: string }[] } };
    assert.ok(
      rmeta.notice.rows.some((r) => r.v.includes("2026년 7월 1일 결재 완료")),
      "재생성 공고문의 결재일은 재생성일이 아니라 실제 서명일이다",
    );

    // ── 후속 문서(완료보고) 파생 → 채번·역링크·결재선 ──
    // 공고문과 달리 자동이 아니다 — 공사가 끝난 뒤 사람이 시작한다.
    const src = {
      docNo: doc.docNo!,
      title: doc.title,
      approvedAt: new Date(),
      work: form.work,
      vendor: "A 이엔지(주)",
      amountRaw: cls.amountRaw,
      vatIncluded: cls.vatIncluded,
    };
    const reportDraft = buildReportDraft(src, {
      period: "2026년 8월 10일 ~ 8월 12일",
      condition: "교체 완료 및 정상 작동 확인함.",
      inspector: "관리과장 김담당",
    });
    const report = await createDocument({
      tenantId: tenant.id,
      moduleId: "approvals",
      numberOnSubmit: true, // 운영 코드(makeFollowup)와 같은 조건으로 만든다
      type: followupDocType.report,
      title: reportDraft.title,
      meta: {
        sourceDocId: doc.id,
        kind: "report",
        draft: reportDraft,
        cls: followupCls(cls as never, "report"),
        plannedSteps: [],
      },
      createdById: staff.id,
    });
    assert.equal(report.docNo, null, "초안에는 번호가 없다 — 채번은 상신 때");
    assert.equal(report.status, "draft", "파생 문서는 초안 — 결재는 따로 받는다");
    // 역링크 조회(JSON path 필터)가 실제 DB에서 걸리는지
    const found = await findFollowupFor(doc.id, "report");
    assert.equal(found?.id, report.id);
    assert.equal(await findFollowupFor(doc.id, "expense"), null); // 종류별로 갈린다
    // 폐기한 후속 문서는 없는 것으로 — 이 필터가 없으면 잘못 만든 보고서를
    // 폐기한 뒤 다시 만들 길이 없다(공고문과 같은 규칙)
    await db.document.update({ where: { id: report.id }, data: { status: "void" } });
    assert.equal(
      await findFollowupFor(doc.id, "report"),
      null,
      "폐기본은 파생 이력으로 치지 않는다 — 재생성이 열린다",
    );
    await db.document.update({ where: { id: report.id }, data: { status: "draft" } });

    // 완료보고는 3단 — 회장이 붙지 않는다(원 품의는 회장까지 4단이었다)
    assert.deepEqual(await submitDocument(report.id, staff.id), {});
    assert.ok(
      (await db.document.findUniqueOrThrow({ where: { id: report.id } })).docNo?.startsWith("보고-"),
      "상신하면 완료보고 채번 접두사는 보고",
    );
    const rSteps = await db.approvalStep.findMany({
      where: { documentId: report.id },
      orderBy: { order: "asc" },
    });
    assert.equal(rSteps.length, 2, "내부 결재선 2명만 — 외부 결재자 없음");
    assert.ok(rSteps.every((s) => s.userId), "외부(토큰) 단계가 없어야 한다");
    assert.deepEqual(rSteps.map((s) => s.status), ["approved", "pending"]);

    // ── 결재선이 기안자 한 명뿐인 단지: 그 칸은 자동 서명하지 않는다 ──
    // 자동으로 찍어 버리면 승인할 사람이 없어 문서가 영영 pending으로 남는다.
    await db.tenant.update({
      where: { id: tenant.id },
      data: { approvalLine: [director.id] },
    });
    const solo = await db.document.create({
      data: {
        tenantId: tenant.id,
        moduleId: "approvals",
        type: "gian",
        docNo: null, // 채번은 상신 때 — 초안은 번호가 없다
        title: "혼자 쓰는 단지 기안",
        status: "draft",
        createdById: director.id,
        meta: { cls: { ...cls, docType: "gian", externalApprovers: [] }, draft, plannedSteps: [], form },
      },
    });
    assert.deepEqual(await submitDocument(solo.id, director.id), {});
    // 상신이 채번한다 — 올리지 않고 버린 초안이 결번을 남기지 않게
    const numbered = await db.document.findUniqueOrThrow({ where: { id: solo.id } });
    assert.ok(numbered.docNo?.startsWith("기안-"), "상신 시 채번된다");
    const soloSteps = await db.approvalStep.findMany({
      where: { documentId: solo.id },
      orderBy: { order: "asc" },
    });
    assert.equal(soloSteps.length, 1);
    assert.equal(soloSteps[0].status, "pending", "한 칸뿐이면 눌러서 결재해야 한다");
    assert.deepEqual(await actOnStep(soloSteps[0].id, "approve", ""), { done: true });
    assert.equal(
      (await db.document.findUniqueOrThrow({ where: { id: solo.id } })).status,
      "final",
    );

    // ── 동시 상신: 한 명만 자리를 잡는다 ──
    // 가드가 read-then-write면 둘 다 통과해 같은 문서를 두 번 채번하고(결번),
    // 먼저 깐 결재선을 뒤가 지워 삭제된 스텝을 활성화하다 500이 났다.
    const race = await db.document.create({
      data: {
        tenantId: tenant.id,
        moduleId: "approvals",
        type: "gian",
        docNo: null,
        title: "동시 상신 경합 기안",
        status: "draft",
        createdById: director.id,
        meta: { cls: { ...cls, docType: "gian", externalApprovers: [] }, draft, plannedSteps: [], form },
      },
    });
    const results = await Promise.all([
      submitDocument(race.id, director.id),
      submitDocument(race.id, director.id),
    ]);
    assert.equal(
      results.filter((r) => !r.error).length,
      1,
      "동시 상신은 정확히 한 쪽만 성공해야 한다",
    );
    assert.equal(
      await db.approvalStep.count({ where: { documentId: race.id } }),
      1,
      "결재선은 한 벌만 깔린다",
    );

    // ── 폐기된 문서는 승인해도 final로 부활하지 않는다 ──
    // 입구 검사와 문서 상태 쓰기(조건부 updateMany) 둘 다 pending일 때만 통과한다.
    // 검사 사이의 진짜 경합 창은 재현이 안 되지만, 쓰기가 조건부인 한 결과는 같다.
    const raceStep = await db.approvalStep.findFirstOrThrow({
      where: { documentId: race.id, status: "pending" },
    });
    await db.document.update({ where: { id: race.id }, data: { status: "void" } });
    assert.ok(
      (await actOnStep(raceStep.id, "approve", "")).error,
      "폐기된 문서는 승인이 거부된다",
    );
    assert.equal(
      (await db.document.findUniqueOrThrow({ where: { id: race.id } })).status,
      "void",
      "폐기 문서가 final로 부활하면 안 된다",
    );

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
