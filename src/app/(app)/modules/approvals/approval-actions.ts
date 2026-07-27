"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { actOnStep, reissueToken, submitDocument } from "@/lib/gian/approval";
import { createNoticeFrom, findNoticeFor } from "@/lib/gian/notice";
import { Role } from "@/generated/prisma/enums";

export type ActionState = { error?: string } | undefined;

/** 문서가 내 단지 것인지 — 결재 액션 공통 경계 */
async function myDoc(docId: string) {
  const session = await requireSession();
  const doc = await db.document.findUnique({ where: { id: docId } });
  if (!doc || doc.tenantId !== session.tenantId || doc.moduleId !== "approvals")
    return { session, doc: null };
  return { session, doc };
}

export async function submitGian(docId: string): Promise<ActionState> {
  const { session, doc } = await myDoc(docId);
  if (!doc) return { error: "문서를 찾을 수 없습니다." };
  // 상신은 작성자 또는 소장 — 남의 초안을 마음대로 결재에 올리지 못하게
  if (doc.createdById !== session.userId && session.role !== Role.DIRECTOR)
    return { error: "작성자 또는 소장만 상신할 수 있습니다." };

  const result = await submitDocument(docId, session.userId);
  revalidatePath(`/modules/approvals/${docId}`);
  return result.error ? result : undefined;
}

export async function actOnGianStep(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const stepId = String(formData.get("stepId") ?? "");
  const action = formData.get("action") === "reject" ? "reject" : "approve";
  const comment = String(formData.get("comment") ?? "");

  const session = await requireSession();
  const step = await db.approvalStep.findUnique({
    where: { id: stepId },
    include: { document: { select: { id: true, tenantId: true } } },
  });
  // 내부 결재는 본인 차례만 — 외부(토큰) 결재는 /approve/[token] 경로가 담당
  if (
    !step ||
    step.document.tenantId !== session.tenantId ||
    step.userId !== session.userId
  )
    return { error: "결재 권한이 없습니다." };
  if (action === "reject" && !comment.trim())
    return { error: "반려 사유를 입력해 주세요." };

  const result = await actOnStep(stepId, action, comment);
  revalidatePath(`/modules/approvals/${step.document.id}`);
  return result.error ? { error: result.error } : undefined;
}

/**
 * 공고문 수동 생성 — 결재 완료 시 자동 파생이 실패했을 때의 복구 경로.
 * 자동 생성은 결재를 막지 않으려고 실패를 삼키므로(approval.ts), 사용자가 스스로
 * 다시 만들 수 있어야 한다(운영자 문의로 떠넘기지 않는다).
 */
export async function makeGianNotice(formData: FormData) {
  const docId = String(formData.get("docId") ?? "");
  const { doc } = await myDoc(docId);
  if (!doc || doc.status !== "final") return;

  await createNoticeFrom(doc);
  const notice = await findNoticeFor(docId);
  revalidatePath(`/modules/approvals/${docId}`);
  if (notice) redirect(`/modules/approvals/${notice.id}`);
}

export async function reissueGianToken(stepId: string): Promise<ActionState> {
  const session = await requireSession();
  const step = await db.approvalStep.findUnique({
    where: { id: stepId },
    include: { document: { select: { id: true, tenantId: true } } },
  });
  if (!step || step.document.tenantId !== session.tenantId)
    return { error: "권한이 없습니다." };

  const result = await reissueToken(stepId);
  revalidatePath(`/modules/approvals/${step.document.id}`);
  return "error" in result ? { error: result.error } : undefined;
}
