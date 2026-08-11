import crypto from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { assignDocNo } from "@/lib/documents";
import { notifyUser } from "@/lib/notifications";
import { mailerEnabled, sendApprovalRequest, trySend } from "@/lib/mailer";
import { createNoticeFrom } from "./notice";
import {
  buildApprovalSteps,
  externalRoleLabels,
  orderInternalLine,
  type Classification,
  type ExternalApprover,
  type ExternalRole,
} from "./rules";

/**
 * 결재 엔진 — 상신·승인·반려·완료 상태 전이.
 * 기안·품의 모듈이 먼저 쓰지만, 이후 공지문·회의록 모듈이 같은 엔진을 재사용한다.
 *
 * 문서 상태: draft → pending → final | rejected (반려 후 재상신 가능)
 * 단계 상태: waiting → pending → approved | rejected
 * 외부 결재자(회장·감사)는 계정 없이 서명 토큰 링크로 참여한다.
 */

export const TOKEN_TTL_DAYS = 7;

type StepLike = {
  status: string;
  token: string | null;
  tokenExpiresAt: Date | null;
};

/** 서명 토큰 판정 — 순수 함수 (approval-flow.test.ts가 검증) */
export function tokenState(
  step: StepLike | null,
  docStatus: string | undefined,
  now = new Date(),
): "valid" | "expired" | "done" | "invalid" {
  if (!step || !step.token) return "invalid";
  if (step.status === "approved" || step.status === "rejected") return "done";
  if (step.status !== "pending" || docStatus !== "pending") return "invalid";
  if (!step.tokenExpiresAt || step.tokenExpiresAt <= now) return "expired";
  return "valid";
}

// 회의록 병렬 서명(minutes actions)도 같은 토큰 발급 규칙을 그대로 쓴다 — export만 추가, 동작 변경 없음.
export const newToken = () => crypto.randomBytes(32).toString("hex");
export const tokenExpiry = () =>
  new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

/** 공백·중점을 지운 이름 비교 — "이 대표"와 "이대표"를 같게 본다. approve·sign 서명 공용 */
export const normalizeName = (s: string) => s.replace(/[\s·]/g, "");

/**
 * 결재 차례 안내 — 내부는 인앱 알림, 외부는 메일(SMTP가 켜져 있고 이메일이 있을 때).
 * DB 상태 전이는 호출 전에 트랜잭션으로 끝나 있다 — 여기가 실패해도 문서는 멈추지 않고,
 * 외부 결재자는 문서 화면의 링크 복사 버튼이 기본 전달 수단(카톡 등)이다.
 * 외부 연락처는 단계 스냅샷이 아니라 현재 설정에서 읽는다(연락처는 최신이 맞다).
 */
async function notifyStepActivated(
  doc: { id: string; tenantId: string; title: string },
  step: {
    userId?: string | null;
    externalRole?: string | null;
    name: string;
    token: string | null;
  },
) {
  if (step.userId) {
    await notifyUser({
      tenantId: doc.tenantId,
      userId: step.userId,
      type: "approval_request",
      title: `[결재 요청] ${doc.title}`,
      link: `/modules/approvals/${doc.id}`,
    });
    return;
  }

  if (mailerEnabled() && step.externalRole && step.token) {
    const tenant = await db.tenant.findUnique({
      where: { id: doc.tenantId },
      select: { name: true, externalApprovers: true },
    });
    const person = (
      (tenant?.externalApprovers as ExternalApprover[] | null) ?? []
    ).find((e) => e.role === step.externalRole);
    if (person?.email)
      await trySend(() =>
        sendApprovalRequest(
          person.email!,
          step.name,
          tenant!.name,
          doc.title,
          step.token!,
        ),
      );
  }
}

/**
 * 결재선 재료 — 상신·문서 화면 미리보기·작성 화면 미리보기가 **같은 것**을 보도록 한 곳에서만 만든다.
 * 세 곳이 각자 조회하던 때는 기안자 칸이 상신 후에야 나타나는 식으로 어긋났다.
 */
export async function approvalLineFor(
  tenantId: string,
  drafterId?: string | null,
): Promise<{
  internal: { userId: string; name: string }[];
  external: ExternalApprover[];
}> {
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { approvalLine: true, externalApprovers: true },
  });
  const ids = orderInternalLine(
    (tenant.approvalLine as string[] | null) ?? [],
    drafterId,
  );
  // tenantId 필터 필수 — orderInternalLine이 drafterId를 검증 없이 맨 앞에 붙이는데,
  // 임퍼서네이션 중 만든 기안의 createdById는 이 단지 소속이 아닌 운영자 id다.
  // 필터가 없으면 그 이름이 결재란에 인쇄되고 상신 시각으로 자동 승인까지 된다.
  const users = await db.user.findMany({
    where: { id: { in: ids }, tenantId },
    select: { id: true, name: true },
  });
  const byId = new Map(users.map((u) => [u.id, u.name]));
  return {
    internal: ids
      .filter((id) => byId.has(id))
      .map((id) => ({ userId: id, name: byId.get(id)! })),
    external: (tenant.externalApprovers as ExternalApprover[] | null) ?? [],
  };
}

/** 상신 (또는 반려 후 재상신) — 현재 결재선 설정으로 스냅샷을 새로 뜬다 */
export async function submitDocument(docId: string, actorUserId: string) {
  const doc = await db.document.findUnique({ where: { id: docId } });
  if (!doc || doc.moduleId !== "approvals") return { error: "문서를 찾을 수 없습니다." };
  if (doc.status !== "draft" && doc.status !== "rejected")
    return { error: "이미 결재가 진행 중이거나 완료된 문서입니다." };

  const meta = doc.meta as { cls?: Classification } | null;
  if (!meta?.cls) return { error: "문서 데이터가 올바르지 않습니다." };

  const { internal, external } = await approvalLineFor(
    doc.tenantId,
    doc.createdById,
  );

  const { steps, missing } = buildApprovalSteps(meta.cls, internal, external);
  if (steps.length === 0)
    return { error: "결재선이 비어 있습니다. 설정 > 결재선에서 결재자를 지정해 주세요." };
  // 첫 칸이 기안자면 기안 행위가 곧 그 칸의 서명 — 상신 시각으로 승인 상태를 찍는다.
  // 단 결재란이 그 한 칸뿐이면(소장 혼자 쓰는 단지) 기안이자 결재라 눌러서 처리해야 한다 —
  // 자동 서명해 버리면 승인할 사람이 없어 문서가 영영 pending으로 남는다.
  const drafterSigned =
    !!doc.createdById &&
    internal[0]?.userId === doc.createdById &&
    steps.length > 1;
  if (missing.length > 0)
    return {
      error: `${missing.map((r: ExternalRole) => externalRoleLabels[r]).join("·")}이(가) 등록되지 않았습니다. 설정 > 결재선에서 등록해 주세요.`,
    };

  // 상신 자리를 먼저 잡는다 — 동시 상신(더블클릭·두 탭)이 위의 상태 검사를 나란히
  // 통과하면 같은 문서를 두 번 채번해 번호가 바뀌고(결번), 먼저 깐 결재선을 뒤가
  // 지워 삭제된 스텝을 활성화하려다 500이 난다. 읽어 둔 상태 그대로일 때만 진행.
  const claimed = await db.document.updateMany({
    where: { id: doc.id, status: doc.status },
    data: { status: "pending" },
  });
  if (claimed.count === 0)
    return { error: "이미 결재가 진행 중이거나 완료된 문서입니다." };

  // 채번은 여기서 — 초안일 때 번호를 주면 올리지 않고 버린 문서가 결번을 남긴다.
  // 재상신이면 이미 번호가 있고, assignDocNo가 그대로 둔다.
  try {
    await assignDocNo(doc);
  } catch (e) {
    // 채번이 무산되면 잡은 자리를 되돌린다 — 아니면 결재선 없는 pending으로 남는다
    await db.document.updateMany({
      where: { id: doc.id, status: "pending" },
      data: { status: doc.status },
    });
    throw e;
  }

  // 재상신이면 이전 결재 기록을 지우고 새 스냅샷으로 — 문서 하나에 결재는 한 판.
  // 단 지우기 전에 이전 판을 meta.approvalHistory로 옮긴다 — 반려 사유·서명 증적은
  // 문서의 역사라, 지워 버리면 "누가 왜 반려했는데 기록이 없다"가 된다.
  // (토큰은 옮기지 않는다 — 죽은 판의 서명 링크가 증적에 살아남으면 안 된다)
  const now = new Date();
  const prevSteps = await db.approvalStep.findMany({
    where: { documentId: doc.id },
    orderBy: { order: "asc" },
  });
  const prevHistory =
    (doc.meta as { approvalHistory?: Prisma.JsonArray }).approvalHistory ?? [];
  const archive =
    prevSteps.length > 0
      ? [
          db.document.update({
            where: { id: doc.id },
            data: {
              meta: {
                ...(doc.meta as object),
                approvalHistory: [
                  ...prevHistory,
                  {
                    archivedAt: now,
                    steps: prevSteps.map((s) => ({
                      order: s.order,
                      name: s.name,
                      userId: s.userId,
                      externalRole: s.externalRole,
                      status: s.status,
                      comment: s.comment,
                      actedAt: s.actedAt,
                      signature: s.signature,
                    })),
                  },
                ],
              },
            },
          }),
        ]
      : [];
  // 첫 결재 차례(기안자 자동 서명 칸의 다음)는 결재선을 까는 트랜잭션 안에서 함께
  // pending으로 만든다 — 깔고 나서 따로 활성화하면 그 사이에 죽었을 때 전원 waiting인
  // 멈춘 문서가 남는다(아무에게도 차례가 안 온다). 외부 결재자면 토큰도 여기서 발급.
  const firstActive = drafterSigned ? 1 : 0;
  const firstToken = steps[firstActive].userId ? null : newToken();
  await db.$transaction([
    ...archive,
    db.approvalStep.deleteMany({ where: { documentId: doc.id } }),
    db.approvalStep.createMany({
      data: steps.map((s, i) => ({
        documentId: doc.id,
        order: s.order,
        userId: s.userId,
        externalRole: s.externalRole,
        name: s.name,
        status:
          drafterSigned && i === 0
            ? "approved"
            : i === firstActive
              ? "pending"
              : "waiting",
        actedAt: drafterSigned && i === 0 ? now : null,
        ...(i === firstActive && firstToken
          ? { token: firstToken, tokenExpiresAt: tokenExpiry() }
          : {}),
      })),
    }),
  ]);

  // 알림·메일은 커밋 뒤 — 실패해도 결재는 이미 유효하게 굴러간다
  await notifyStepActivated(doc, { ...steps[firstActive], token: firstToken });

  void actorUserId; // 상신자 기록은 Document.createdById로 충분 — 별도 저장 안 함
  return {};
}

/**
 * 승인/반려 공통 처리. 호출 전에 권한(내부: userId 일치, 외부: 토큰 검증)이 끝나 있어야 한다.
 * 조건부 updateMany가 이중 제출을 막는다 — 링크를 두 번 눌러도 한 번만 처리된다.
 */
export type SignEvidence = { ip: string; ua: string; typedName: string };

/** 트랜잭션 안에서 조건부 쓰기가 빈손일 때 — 전체를 되돌리고 사용자 문구로 돌려준다 */
class ActFailed extends Error {}

export async function actOnStep(
  stepId: string,
  action: "approve" | "reject",
  comment: string,
  /** 외부(토큰) 서명일 때만 — 내부 결재는 세션이 곧 증적이라 없다 */
  signature?: SignEvidence,
): Promise<{ error?: string; done?: boolean }> {
  const step = await db.approvalStep.findUnique({
    where: { id: stepId },
    include: { document: true },
  });
  if (!step || step.document.status !== "pending")
    return { error: "결재할 수 없는 문서입니다." };

  const doc = step.document;

  // 다음 단계와 토큰은 트랜잭션 밖에서 준비 — 안에서는 쓰기만 한다
  const next =
    action === "approve"
      ? await db.approvalStep.findFirst({
          where: { documentId: doc.id, order: step.order + 1 },
        })
      : null;
  const nextToken = next && !next.userId ? newToken() : null;

  // 서명과 그 결과(다음 차례 활성화·반려·완료)는 한 트랜잭션 — 서명만 쓰고 죽으면
  // 다음 차례가 영영 오지 않는 멈춘 문서가 남는데, 복구 경로가 없다.
  // 회수·폐기와의 경합도 여기서 걸러진다: 문서 상태 쓰기가 빈손이면 서명까지 되돌아가므로
  // "회수된 문서에 서명 기록만 남는" 어정쩡한 상태가 생기지 않는다.
  let outcome: "advanced" | "rejected" | "final";
  try {
    outcome = await db.$transaction(async (tx) => {
      const updated = await tx.approvalStep.updateMany({
        where: { id: stepId, status: "pending" },
        data: {
          status: action === "approve" ? "approved" : "rejected",
          comment: comment.trim() || null,
          actedAt: new Date(),
          ...(signature ? { signature } : {}),
        },
      });
      if (updated.count === 0) throw new ActFailed("이미 처리된 결재입니다.");

      if (action === "reject") {
        const rejected = await tx.document.updateMany({
          where: { id: doc.id, status: "pending" },
          data: { status: "rejected" },
        });
        if (rejected.count === 0)
          throw new ActFailed("문서가 회수되었거나 폐기되어 처리할 수 없습니다.");
        return "rejected";
      }

      if (next) {
        await tx.approvalStep.update({
          where: { id: next.id },
          data: {
            status: "pending",
            ...(nextToken
              ? { token: nextToken, tokenExpiresAt: tokenExpiry() }
              : {}),
          },
        });
        return "advanced";
      }

      // 마지막 결재자 승인 → 결재 완료. 조건부로 쓴다 — 승인 처리 중에 기안자가
      // 폐기(void)·회수(draft)했다면 그 문서를 final로 부활시키고 공고문까지 파생하게 된다.
      const finalized = await tx.document.updateMany({
        where: { id: doc.id, status: "pending" },
        data: { status: "final" },
      });
      if (finalized.count === 0)
        throw new ActFailed("문서가 회수되었거나 폐기되어 결재를 완료할 수 없습니다.");
      return "final";
    });
  } catch (e) {
    if (e instanceof ActFailed) return { error: e.message };
    throw e;
  }

  // 여기부터는 알림·파생 — 실패해도 위의 상태 전이는 이미 유효하다

  if (outcome === "rejected") {
    if (doc.createdById)
      await notifyUser({
        tenantId: doc.tenantId,
        userId: doc.createdById,
        type: "approval_rejected",
        title: `[반려] ${doc.title}`,
        body: comment.trim() || undefined,
        link: `/modules/approvals/${doc.id}`,
      });
    return { done: true };
  }

  if (outcome === "advanced") {
    await notifyStepActivated(doc, { ...next!, token: nextToken });
    return {};
  }

  // 공고문 자동 파생 — 승인 전에 만들면 결재도 안 난 공고가 나간다.
  // 실패해도 결재 완료를 되돌리지 않는다: 공고문은 문서 화면에서 언제든 다시 만들 수 있지만,
  // 결재 완료가 롤백되면 결재자 전원이 다시 승인해야 한다.
  try {
    await createNoticeFrom(doc);
  } catch (e) {
    console.error("notice derive failed:", e);
  }

  if (doc.createdById)
    await notifyUser({
      tenantId: doc.tenantId,
      userId: doc.createdById,
      type: "approval_done",
      title: `[결재 완료] ${doc.title}`,
      link: `/modules/approvals/${doc.id}`,
    });
  return { done: true };
}

/** 만료된 외부 서명 링크 재발급 — 기존 링크는 토큰 교체로 즉시 무효 */
export async function reissueToken(stepId: string) {
  const token = newToken();
  const updated = await db.approvalStep.updateMany({
    where: { id: stepId, status: "pending", userId: null },
    data: { token, tokenExpiresAt: tokenExpiry() },
  });
  return updated.count > 0 ? { token } : { error: "재발급할 수 없는 단계입니다." };
}
