"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { assignDocNo, createDocument } from "@/lib/documents";
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
import { DEFAULT_PLACES, DEFAULT_POST_TO, mergePlaces } from "@/lib/gian/notice";
import { ymdKst } from "@/lib/utils";

const MODULE_ID = "notice";

/** 단지당 일일 생성 한도 — 셀프서비스라 무한 생성 남용을 막는다 (기안 모듈과 동일) */
const DAILY_LIMIT = 30;

/**
 * 게시물 작성은 일반 사무라 전 직원이 만든다(기안과 같은 경계) —
 * 수정·폐기만 작성자 본인 또는 마스터로 좁힌다.
 */
async function requireNotice() {
  const session = await requireTenantSession();
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
    // 생성 직후는 초안 — 내용을 확인하고 [공지문 완성]을 눌러야 채번·확정된다.
    // 번호를 지금 주면 버린 초안이 공지 대장에 영구 결번을 남긴다(기안과 같은 규칙).
    status: "draft",
    numberOnSubmit: true,
    createdById: session.userId,
    meta: {
      form: { typeKey, when, where, detail, contact },
      draft,
      kind,
      postedDate: ymdKst(new Date()),
      // 게시장소·게시기간 — 결재 파생 공고문과 같은 기본값, 게시 설정 카드에서 고친다
      place: DEFAULT_PLACES.join(", "),
      postTo: DEFAULT_POST_TO,
    },
  });
  revalidatePath("/modules/notice");
  redirect(`/modules/notice/${doc.id}`);
}

/**
 * 본문 수정 — 결재 파생 공고문의 saveNoticeBody와 같은 문법의 수정 화면 폼 액션.
 * LLM 재호출 없이 저장값만 고친다. 개요는 "라벨: 값" 한 줄이 항목 하나,
 * 본문(협조 사항·개조식)은 한 줄이 한 항목. 게시장소·게시기간은 문서 화면에서 따로.
 */
export async function saveNoticePostBody(formData: FormData) {
  const session = await requireNotice();
  const docId = String(formData.get("docId") ?? "");
  const found = await ownedPost(docId, session);
  if ("error" in found) return; // 화면 밖 직접 호출 — 조용히 무시 (saveNoticeBody와 동일)
  if (found.doc.status === "void") return;

  const meta = (found.doc.meta ?? {}) as { draft?: NoticePostDraft };
  const title =
    String(formData.get("title") ?? "").trim() || meta.draft?.title || found.doc.title;
  const draft: NoticePostDraft = {
    title,
    intro: String(formData.get("intro") ?? "").trim(),
    items: textToItems(String(formData.get("items") ?? "")),
    bodyLines: String(formData.get("body") ?? "")
      .split("\n")
      .map((l) => l.trimEnd())
      .filter((l) => l.trim()),
    closing: String(formData.get("closing") ?? "").trim(),
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
  redirect(`/modules/notice/${docId}`);
}

/** 게시장소·게시기간 — 게시 실무라 문서 화면에서 바로 고친다 (NoticePosting 카드 공용) */
export async function updateNoticePostPosting(
  _prev: { error?: string } | undefined,
  formData: FormData,
) {
  const session = await requireNotice();
  const docId = String(formData.get("docId") ?? "");
  const found = await ownedPost(docId, session);
  if ("error" in found) return found;
  // 폐기본은 화면 밖(직접 호출)에서도 잠근다
  if (found.doc.status === "void")
    return { error: "폐기된 게시물은 수정할 수 없습니다." };

  const places = mergePlaces(
    formData.getAll("places").map(String),
    String(formData.get("customPlace") ?? ""),
  );
  if (places.length === 0)
    return { error: "게시장소를 한 곳 이상 골라 주세요." };
  const postTo = String(formData.get("postTo") ?? "").trim() || DEFAULT_POST_TO;
  await db.document.update({
    where: { id: found.doc.id },
    data: {
      meta: { ...(found.doc.meta as object), place: places.join(", "), postTo },
    },
  });
  revalidatePath(`/modules/notice/${docId}`);
  return {};
}

/**
 * 완성 — 내용 확인이 끝난 초안에 문서번호를 부여하고 확정한다.
 * 번호 부여(멱등)가 먼저다: 여기서 실패해도 초안으로 남아 다시 누르면 되지만,
 * 확정부터 하면 번호 없는 완성본이 남는다.
 */
export async function finalizeNoticePost(docId: string) {
  const session = await requireNotice();
  const found = await ownedPost(docId, session);
  if ("error" in found) return found;
  if (found.doc.status !== "draft")
    return { error: "이미 완성됐거나 폐기된 게시물입니다." };
  await assignDocNo(found.doc);
  // 한 번만 일어나야 하는 일 — 조건부 updateMany로 자리를 잡는다 (동시 클릭 안전)
  await db.document.updateMany({
    where: { id: found.doc.id, status: "draft" },
    data: { status: "final" },
  });
  revalidatePath(`/modules/notice/${docId}`);
  revalidatePath("/modules/notice");
  return { ok: true };
}

/**
 * 폐기 — 완성본은 목록에 '폐기'로 남고 열람만 된다.
 * 한 번도 완성되지 않은 초안(docNo 없음)은 하드 삭제 — 공지 대장에 결번을
 * 남기지 않는다(기안 초안 폐기와 같은 규칙).
 */
export async function voidNoticePost(docId: string) {
  const session = await requireNotice();
  const found = await ownedPost(docId, session);
  if ("error" in found) return found;
  if (!found.doc.docNo) {
    await db.document.delete({ where: { id: found.doc.id } });
  } else {
    await db.document.updateMany({
      where: { id: found.doc.id, status: { not: "void" } },
      data: { status: "void" },
    });
  }
  revalidatePath("/modules/notice");
  redirect("/modules/notice");
}
