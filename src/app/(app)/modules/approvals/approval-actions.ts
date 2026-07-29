"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  allowedMime,
  MAX_FILE_BYTES,
  MAX_FILES_PER_DOC,
  MAX_FILES_PER_QUOTE,
} from "@/lib/gian/attachments";
import { actOnStep, reissueToken, submitDocument } from "@/lib/gian/approval";
import type { GianDraft } from "@/lib/gian/claude";
import {
  createNoticeFrom,
  findNoticeFor,
  type NoticeDoc,
} from "@/lib/gian/notice";
import { Role } from "@/generated/prisma/enums";

export type ActionState = { error?: string } | undefined;

/** 남의 초안을 상신할 수 있는 권한 — 마스터·매니저 ("use server"라 로컬 상수) */
const canSubmitOthers = (role: Role) =>
  role === Role.DIRECTOR || role === Role.ACCOUNTANT;

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
  // 상신은 작성자·마스터·매니저 — 남의 초안을 아무나 결재에 올리지 못하게 막되,
  // 지출 문서를 실제로 챙기는 매니저는 올릴 수 있어야 한다
  if (doc.createdById !== session.userId && !canSubmitOthers(session.role))
    return { error: "작성자·마스터·매니저만 상신할 수 있습니다." };

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
 * 초안 직접 수정 저장 — 결재 전 문서만.
 * 절 개수는 원본 draft를 따르고(폼이 그만큼만 그린다), 각 필드는 줄 단위로 자른다.
 * 문서함 검색용 content도 같이 갱신한다 — 안 하면 수정 전 문장으로 검색된다.
 */
export async function saveGianDraft(formData: FormData) {
  const docId = String(formData.get("docId") ?? "");
  const { doc } = await myDoc(docId);
  if (!doc) return;
  if (doc.status !== "draft" && doc.status !== "rejected") return;

  const meta = doc.meta as { draft?: GianDraft } | null;
  if (!meta?.draft) return;

  const lines = (key: string) =>
    String(formData.get(key) ?? "")
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+$/, ""))
      .filter((l) => l.trim());

  const title = String(formData.get("title") ?? "").trim() || meta.draft.title;
  const draft: GianDraft = {
    ...meta.draft,
    title,
    legalBasis: lines("legalBasis"),
    sections: meta.draft.sections.map((sec, i) => ({
      heading: String(formData.get(`heading${i}`) ?? "").trim() || sec.heading,
      lines: lines(`lines${i}`),
    })),
    attachments: lines("attachments"),
  };

  await db.document.update({
    where: { id: doc.id },
    data: {
      title,
      content: [
        draft.title,
        ...draft.legalBasis,
        ...draft.sections.flatMap((s) => [s.heading, ...s.lines]),
        ...draft.attachments,
      ].join("\n"),
      meta: { ...(doc.meta as object), draft },
    },
  });
  revalidatePath(`/modules/approvals/${doc.id}`);
  redirect(`/modules/approvals/${doc.id}?saved=1`);
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

/**
 * 상신 회수 — 아직 아무도 승인하지 않았을 때만 초안으로 되돌린다.
 * 한 명이라도 승인했으면 막는다: 이미 결재한 사람의 판단을 조용히 지우는 일이 된다.
 * 그때는 결재자에게 반려를 요청하거나 폐기해야 한다.
 */
export async function withdrawGian(docId: string): Promise<ActionState> {
  const { session, doc } = await myDoc(docId);
  if (!doc) return { error: "문서를 찾을 수 없습니다." };
  if (doc.createdById !== session.userId && session.role !== Role.DIRECTOR)
    return { error: "작성자 또는 마스터만 회수할 수 있습니다." };
  if (doc.status !== "pending")
    return { error: "결재가 진행 중인 문서만 회수할 수 있습니다." };

  const acted = await db.approvalStep.count({
    where: { documentId: docId, status: { in: ["approved", "rejected"] } },
  });
  if (acted > 0)
    return {
      error:
        "이미 결재한 사람이 있어 회수할 수 없습니다. 결재자에게 반려를 요청하거나 문서를 폐기해 주세요.",
    };

  await db.$transaction([
    db.approvalStep.deleteMany({ where: { documentId: docId } }),
    db.document.update({ where: { id: docId }, data: { status: "draft" } }),
  ]);
  revalidatePath(`/modules/approvals/${docId}`);
  return undefined;
}

/**
 * 폐기 — 하드 삭제가 아니라 상태만 void로. 관리 서류는 보존 대상이고,
 * 결재 기록만 사라지면 "누가 승인했는데 문서가 없다"가 된다.
 * 결재가 끝난 문서는 폐기하지 않는다 — 정정은 새 문서로 한다.
 */
export async function voidGian(docId: string): Promise<ActionState> {
  const { session, doc } = await myDoc(docId);
  if (!doc) return { error: "문서를 찾을 수 없습니다." };
  if (doc.createdById !== session.userId && session.role !== Role.DIRECTOR)
    return { error: "작성자 또는 마스터만 폐기할 수 있습니다." };
  if (doc.status === "final")
    return {
      error:
        "결재가 끝난 문서는 폐기할 수 없습니다. 정정이 필요하면 새 문서를 올려 주세요.",
    };
  if (doc.status === "void") return undefined;

  await db.$transaction([
    // 진행 중이던 결재 차례를 남겨 두면 결재자 화면에 계속 뜬다
    db.approvalStep.updateMany({
      where: { documentId: docId, status: "pending" },
      data: { status: "waiting" },
    }),
    db.document.update({ where: { id: docId }, data: { status: "void" } }),
  ]);
  revalidatePath(`/modules/approvals/${docId}`);
  return undefined;
}

/**
 * 공고문의 공사·시행 일자만 고친다 — 게시 전 확정 일자를 넣는 경로.
 * 다른 칸은 결재받은 내용이라 손대지 않는다(그건 새 결재를 받아야 한다).
 */
export async function updateNoticeSchedule(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const docId = String(formData.get("docId") ?? "");
  const schedule = String(formData.get("schedule") ?? "").trim();
  if (!schedule) return { error: "일정을 입력해 주세요." };

  const { doc } = await myDoc(docId);
  const meta = doc?.meta as { notice?: NoticeDoc } | null;
  if (!doc || !meta?.notice) return { error: "공고문을 찾을 수 없습니다." };

  // 첫 행이 "공사일자"/"시행일자" — buildNotice가 항상 그 순서로 만든다
  const rows = meta.notice.rows.map((r, i) =>
    i === 0 ? { ...r, v: schedule } : r,
  );
  const notice = { ...meta.notice, rows };
  await db.document.update({
    where: { id: doc.id },
    data: {
      meta: { ...(doc.meta as object), notice },
      // 문서함 검색용 평문도 같이 — 안 고치면 옛 일정으로 검색된다
      content: [
        notice.intro,
        ...rows.map((r) => `${r.k}: ${r.v}`),
        ...notice.notes.map((n) => n.text),
      ].join("\n"),
    },
  });
  revalidatePath(`/modules/approvals/${doc.id}`);
  return undefined;
}

/** 첨부 확인 체크 — 결재 전 문서만. 목록 자체(draft.attachments)는 건드리지 않는다 */
export async function toggleGianAttachment(docId: string, checked: number[]) {
  const { doc } = await myDoc(docId);
  if (!doc || (doc.status !== "draft" && doc.status !== "rejected")) return;
  await db.document.update({
    where: { id: doc.id },
    data: {
      meta: {
        ...(doc.meta as object),
        attachmentsChecked: [...new Set(checked)].sort((a, b) => a - b),
      },
    },
  });
  revalidatePath(`/modules/approvals/${doc.id}`);
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

/**
 * 견적서 파일 첨부 — 결재 전 문서만. 브라우저가 이미지를 줄여 보내지만
 * 여기가 신뢰 경계라 mime·크기·개수·소유권을 전부 다시 확인한다.
 */
export async function uploadQuoteFile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const docId = String(formData.get("docId") ?? "");
  const rawIdx = String(formData.get("quoteIndex") ?? "");
  const quoteIndex = rawIdx === "" ? null : Number(rawIdx);
  if (quoteIndex !== null && (!Number.isInteger(quoteIndex) || quoteIndex < 0))
    return { error: "잘못된 요청입니다." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { error: "파일을 선택해 주세요." };
  if (!allowedMime(file.type))
    return { error: "이미지 또는 PDF만 첨부할 수 있습니다." };
  if (file.size > MAX_FILE_BYTES)
    return {
      error:
        "3MB 이하만 첨부할 수 있습니다. 종이 견적서는 사진으로 찍어 올리면 자동으로 줄어듭니다.",
    };

  const { doc } = await myDoc(docId);
  if (!doc) return { error: "문서를 찾을 수 없습니다." };
  if (doc.status !== "draft" && doc.status !== "rejected")
    return { error: "결재가 시작된 문서에는 첨부할 수 없습니다." };

  const existing = await db.documentAttachment.findMany({
    where: { documentId: doc.id },
    select: { quoteIndex: true },
  });
  if (existing.length >= MAX_FILES_PER_DOC)
    return { error: `문서당 ${MAX_FILES_PER_DOC}장까지 첨부할 수 있습니다.` };
  if (
    quoteIndex !== null &&
    existing.filter((x) => x.quoteIndex === quoteIndex).length >=
      MAX_FILES_PER_QUOTE
  )
    return { error: `업체당 ${MAX_FILES_PER_QUOTE}장까지 첨부할 수 있습니다.` };

  const buf = Buffer.from(await file.arrayBuffer());
  await db.documentAttachment.create({
    data: {
      documentId: doc.id,
      quoteIndex,
      name: file.name,
      mime: file.type,
      size: buf.byteLength,
      // 결재 당시 파일의 지문 — 나중에 "그때 그 파일인가"를 검증한다
      sha256: crypto.createHash("sha256").update(buf).digest("hex"),
      data: buf,
    },
  });
  revalidatePath(`/modules/approvals/${doc.id}`);
  return undefined;
}

/** 첨부 삭제 — 결재 전 문서만 (상신 후 바꿔치기 방지는 업로드와 같은 가드) */
export async function deleteQuoteFile(
  attachmentId: string,
): Promise<ActionState> {
  const session = await requireSession();
  const att = await db.documentAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      document: {
        select: { id: true, tenantId: true, status: true, moduleId: true },
      },
    },
  });
  if (
    !att ||
    att.document.tenantId !== session.tenantId ||
    att.document.moduleId !== "approvals"
  )
    return { error: "파일을 찾을 수 없습니다." };
  if (att.document.status !== "draft" && att.document.status !== "rejected")
    return { error: "결재가 시작된 문서의 첨부는 지울 수 없습니다." };
  await db.documentAttachment.delete({ where: { id: attachmentId } });
  revalidatePath(`/modules/approvals/${att.document.id}`);
  return undefined;
}
