"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { createDocument } from "@/lib/documents";
import { isSubscribed } from "@/lib/modules";
import { rateLimit } from "@/lib/rate-limit";
import { aiEnabled, generateNoticePost } from "@/lib/notice-ai";
import {
  draftPlainText,
  noticeTypeOf,
  textToItems,
  type NoticeKind,
  type NoticePostDraft,
} from "@/lib/notice-catalog";
import { ymdKst } from "@/lib/utils";

const MODULE_ID = "notice";

/** 단지당 일일 생성 한도 — 셀프서비스라 무한 생성 남용을 막는다 (기안 모듈과 동일) */
const DAILY_LIMIT = 30;

/**
 * 게시물 작성은 일반 사무라 전 직원이 만든다(기안과 같은 경계) —
 * 수정·폐기만 작성자 본인 또는 마스터로 좁힌다.
 */
async function requireNotice() {
  const session = await requireSession();
  if (!(await isSubscribed(session.tenantId!, MODULE_ID)))
    throw new Error("공지문 모듈을 구독 중이 아닙니다.");
  return session;
}

/** 이 모듈이 만든 문서만 — 결재 파생 공고문(moduleId: approvals)은 여기서 못 고친다 */
async function ownedPost(
  docId: string,
  session: Awaited<ReturnType<typeof requireNotice>>,
) {
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId: session.tenantId!, type: "notice", moduleId: MODULE_ID },
  });
  if (!doc) return { error: "문서를 찾을 수 없습니다." as const };
  // 문서 수정·폐기의 공통 경계 — 작성자 본인 또는 마스터
  if (doc.createdById !== session.userId && session.role !== Role.DIRECTOR)
    return { error: "수정·폐기는 작성자 또는 마스터만 할 수 있습니다." as const };
  return { doc };
}

export type GenerateState = { error?: string } | undefined;

export async function generateNoticeAction(
  _prev: GenerateState,
  formData: FormData,
): Promise<GenerateState> {
  // 문서를 만드는 입구 — 화면 가드를 믿지 않고 여기서 다시 검사한다
  const session = await requireNotice();
  const tenantId = session.tenantId!;
  if (!aiEnabled())
    return { error: "AI 초안 생성이 아직 활성화되지 않았습니다. 운영팀에 문의해 주세요." };

  const typeKey = String(formData.get("typeKey") ?? "");
  const type = noticeTypeOf(typeKey);
  if (!type) return { error: "게시물 유형을 선택해 주세요." };
  // 격은 카탈로그가 정한다 — 자유 입력만 폼의 토글을 따른다
  const kind: NoticeKind =
    type.key === "free" && formData.get("kind") === "official" ? "official" : type.kind;
  const when = String(formData.get("when") ?? "").trim();
  const where = String(formData.get("where") ?? "").trim();
  const detail = String(formData.get("detail") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim();
  if (!when && !where && !detail)
    return { error: "일시·대상·내용 중 한 가지는 입력해 주세요." };

  if (rateLimit(`notice:${tenantId}`, DAILY_LIMIT, 24 * 60 * 60 * 1000) <= 0)
    return { error: `오늘 생성 한도(${DAILY_LIMIT}건)에 도달했습니다. 내일 다시 시도해 주세요.` };

  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    select: { name: true },
  });

  let draft: NoticePostDraft;
  try {
    draft = await generateNoticePost({
      kind,
      typeLabel: type.key === "free" ? "자유 입력" : type.label,
      when,
      where,
      detail,
      contact,
      tenantName: tenant.name,
    });
  } catch (e) {
    return {
      error: e instanceof Error && e.message.includes("실패")
        ? e.message
        : "초안 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  const doc = await createDocument({
    tenantId,
    moduleId: MODULE_ID,
    type: "notice",
    title: draft.title,
    content: draftPlainText(draft), // 문서함 검색용 평문
    status: "final", // 결재 없이 관리사무소장 명의 즉시 확정 — 결재 파생 공고문과 같은 취급
    createdById: session.userId,
    meta: {
      form: { typeKey, when, where, detail, contact },
      draft,
      kind,
      postedDate: ymdKst(new Date()),
    },
  });
  revalidatePath("/modules/notice");
  redirect(`/modules/notice/${doc.id}`);
}

/**
 * 본문 수정 — 게시 전 다듬기. LLM 재호출 없이 저장값만 고친다.
 * items는 "라벨: 값" 한 줄 형식(textToItems), bodyLines는 줄 단위.
 */
export async function saveNoticePost(
  docId: string,
  input: { title: string; intro: string; itemsText: string; bodyText: string; closing: string },
) {
  const session = await requireNotice();
  const found = await ownedPost(docId, session);
  if ("error" in found) return found;

  const title = input.title.trim();
  if (!title) return { error: "제목을 입력해 주세요." };
  const meta = (found.doc.meta ?? {}) as { draft?: NoticePostDraft };
  const draft: NoticePostDraft = {
    ...(meta.draft ?? { needsClarification: [] as string[] }),
    title,
    intro: input.intro.trim(),
    items: textToItems(input.itemsText),
    bodyLines: input.bodyText.split("\n").map((l) => l.trim()).filter(Boolean),
    closing: input.closing.trim(),
    needsClarification: meta.draft?.needsClarification ?? [],
  };
  await db.document.update({
    where: { id: found.doc.id },
    data: {
      title,
      content: draftPlainText(draft),
      meta: { ...(found.doc.meta as object), draft },
    },
  });
  revalidatePath(`/modules/notice/${docId}`);
  revalidatePath("/modules/notice");
  return { ok: true };
}

/** 폐기 — 목록에 '폐기'로 남고 열람만 된다. 잘못 만든 게시물의 유일한 정정 경로는 새로 만들기 */
export async function voidNoticePost(docId: string) {
  const session = await requireNotice();
  const found = await ownedPost(docId, session);
  if ("error" in found) return found;
  await db.document.updateMany({
    where: { id: found.doc.id, status: "final" },
    data: { status: "void" },
  });
  revalidatePath("/modules/notice");
  redirect("/modules/notice");
}
