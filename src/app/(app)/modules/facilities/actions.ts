"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { createDocument } from "@/lib/documents";
import { isSubscribed } from "@/lib/modules";
import { parseWon } from "@/lib/won";
import { allowedMime, MAX_FILE_BYTES, MAX_FILES_PER_DOC } from "@/lib/gian/attachments";
import {
  CYCLE_CHOICES,
  WIZARD_QUESTIONS,
  catalogItemOf,
} from "@/lib/inspection/catalog";
import { cycleToRow } from "@/lib/inspection/schedule";

const MODULE_ID = "facilities";
const TYPE = "inspection";

/** 상태를 바꾸는 함수의 공통 입구 — 화면 가드를 믿지 않고 여기서 다시 검사한다 */
async function requireInspection() {
  const session = await requireTenantSession();
  if (!(await isSubscribed(session.tenantId!, MODULE_ID)))
    throw new Error("법정점검 대장 모듈을 구독 중이 아닙니다.");
  return session;
}

/** 항목 관리는 명부와 같은 경계 — 마스터·매니저 */
async function requireItemAdmin() {
  const session = await requireInspection();
  if (session.role !== Role.DIRECTOR && session.role !== Role.ACCOUNTANT)
    return { error: "항목 관리는 마스터·매니저만 할 수 있습니다." as const };
  return { session };
}

/**
 * "YYYY-MM-DD" → KST 00:00. 빈 값 null.
 * new Date("2026-07-20")은 UTC 자정이라 한국 시각으론 전날 09:00 — 앵커가 하루 밀린다
 * (교육 명부 hiredAtOf와 같은 함정).
 */
const kstDateOf = (v: string | undefined | null) =>
  v && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())
    ? new Date(`${v.trim()}T00:00:00+09:00`)
    : null;

const itemPaths = () => {
  revalidatePath("/modules/facilities");
  revalidatePath("/modules/facilities/items");
  revalidatePath("/modules/facilities/setup");
};

/** 리드타임은 0~90일 — 음수·연 단위 오타가 판정을 뒤집지 않게 자른다 */
const clampLead = (n: number) => Math.max(0, Math.min(90, Math.round(n) || 0));

/**
 * 설정 마법사 — 예라고 답한 질문의 카탈로그 항목을 한 번에 켠다.
 * 이미 있는 presetKey는 건너뛴다(재실행이 중복을 만들면 안 된다). 앵커일은
 * 비워 두기 허용 — needsAnchor로 표시되어 "주기를 셀 수 없다"를 알린다.
 */
export async function applyWizard(input: {
  /** 예라고 답한 질문 key 목록 */
  questions: string[];
  /** 카탈로그 key → 마지막 실시일 YYYY-MM-DD (모르면 없음) */
  anchors: Record<string, string>;
}) {
  const gate = await requireItemAdmin();
  if ("error" in gate) return gate;
  const tenantId = gate.session.tenantId!;

  const keys = [
    ...new Set(
      WIZARD_QUESTIONS.filter((q) => input.questions.includes(q.key)).flatMap(
        (q) => q.itemKeys,
      ),
    ),
  ];
  if (keys.length === 0) return { error: "켤 항목이 없습니다 — 해당되는 질문에 체크해 주세요." };

  const existing = await db.inspectionItem.findMany({
    where: { tenantId, presetKey: { in: keys } },
    select: { presetKey: true },
  });
  const have = new Set(existing.map((i) => i.presetKey));
  const fresh = keys.filter((k) => !have.has(k));

  if (fresh.length > 0)
    await db.inspectionItem.createMany({
      // 카탈로그 스냅샷 — 이후 카탈로그를 개정해도 이미 켠 항목은 불변
      data: fresh.map((key) => {
        const c = catalogItemOf(key)!;
        return {
          tenantId,
          presetKey: key,
          name: c.label,
          legalBasis: c.legalBasis,
          ...cycleToRow(c.cycle),
          leadDays: c.leadDays,
          lastDoneAt: kstDateOf(input.anchors[key]),
        };
      }),
    });

  itemPaths();
  return { added: fresh.length, skipped: keys.length - fresh.length };
}

/** 사용자 정의 항목 — 카탈로그에 없는 단지 고유 점검(물놀이시설, 열병합 등)의 출구 */
export async function addCustomItem(input: {
  name: string;
  legalBasis: string;
  cycleValue: string; // CYCLE_CHOICES.value
  leadDays: number;
  vendor?: string;
  lastDoneAt?: string;
}) {
  const gate = await requireItemAdmin();
  if ("error" in gate) return gate;
  const name = input.name.trim();
  if (!name) return { error: "항목 이름을 입력해 주세요." };
  const choice = CYCLE_CHOICES.find((c) => c.value === input.cycleValue);
  if (!choice) return { error: "주기를 선택해 주세요." };

  await db.inspectionItem.create({
    data: {
      tenantId: gate.session.tenantId!,
      presetKey: null,
      name,
      legalBasis: input.legalBasis.trim(),
      ...cycleToRow(choice.cycle),
      leadDays: clampLead(input.leadDays),
      vendor: input.vendor?.trim() || null,
      lastDoneAt: kstDateOf(input.lastDoneAt),
    },
  });
  itemPaths();
  return {};
}

/**
 * 항목 수정 — 업체·리드타임·기준일. 주기·근거는 법이 정한 값이라 화면에서 못 고친다
 * (사용자 정의 항목도 잘못 만들었으면 비활성 후 새로 만드는 쪽이 이력에 정직하다).
 * 기준일 수정을 열어 두는 이유: needsAnchor를 풀 유일한 통로가 기록 작성뿐이면
 * "예전에 한 점검"을 가짜 기록으로 만들어야 한다.
 */
export async function updateItem(input: {
  id: string;
  vendor: string;
  leadDays: number;
  lastDoneAt: string;
}) {
  const gate = await requireItemAdmin();
  if ("error" in gate) return gate;
  // tenantId를 조건에 넣는다 — 남의 단지 항목 id로는 아무 행도 맞지 않는다
  await db.inspectionItem.updateMany({
    where: { id: input.id, tenantId: gate.session.tenantId! },
    data: {
      vendor: input.vendor.trim() || null,
      leadDays: clampLead(input.leadDays),
      lastDoneAt: kstDateOf(input.lastDoneAt),
    },
  });
  itemPaths();
  return {};
}

/** 퇴역은 삭제가 아니라 비활성 — 지난 기록의 항목명이 허공에 뜨면 안 된다 */
export async function setItemActive(id: string, active: boolean) {
  const gate = await requireItemAdmin();
  if ("error" in gate) return gate;
  await db.inspectionItem.updateMany({
    where: { id, tenantId: gate.session.tenantId! },
    data: { active },
  });
  itemPaths();
  return {};
}

// ── 점검 기록 — Document(type: inspection) ──────────────────────

export type RecordState = { error?: string } | undefined;

/**
 * 완료 기록 저장 — 값을 채우는 정형 문서라 작문이 없다(LLM 불호출).
 * 결재 없이 바로 확정되는 문서라 생성 시 채번한다(공고문과 같은 규칙 — 초안
 * 단계를 두면 사용자가 이미 확인한 값을 한 번 더 확인하라는 요구가 된다).
 *
 * 저장이 끝나면 lastDoneAt이 굴러 다음 도래일이 저절로 이동한다.
 */
export async function createInspectionRecord(
  _prev: RecordState,
  formData: FormData,
): Promise<RecordState> {
  // 문서를 만드는 입구 — 화면 가드를 믿지 않고 여기서 다시 검사한다
  const session = await requireInspection();
  const tenantId = session.tenantId!;

  const itemId = String(formData.get("itemId") ?? "");
  const item = await db.inspectionItem.findFirst({
    where: { id: itemId, tenantId },
  });
  if (!item) return { error: "점검 항목을 선택해 주세요." };

  const doneAt = String(formData.get("doneAt") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doneAt))
    return { error: "실시일자를 입력해 주세요." };
  const performedBy =
    String(formData.get("performedBy") ?? "").trim() || "자체";
  const result = formData.get("result") === "지적사항" ? "지적사항" : "정상";
  const findings = String(formData.get("findings") ?? "").trim();
  const actions = String(formData.get("actions") ?? "").trim();
  if (result === "지적사항" && !findings)
    return { error: "지적 내용을 입력해 주세요." };
  const cost = parseWon(formData.get("cost"));

  const doc = await createDocument({
    tenantId,
    moduleId: MODULE_ID,
    type: TYPE,
    title: `${item.name} (${doneAt})`,
    // 문서함 검색용 평문
    content: [item.name, item.legalBasis, `결과: ${result}`, findings, actions]
      .filter(Boolean)
      .join("\n"),
    status: "final",
    createdById: session.userId,
    // 항목명·근거 스냅샷 — 항목을 나중에 고쳐도 지난 증빙은 불변(교육일지 참석자와 같은 원칙)
    meta: {
      itemId: item.id,
      itemName: item.name,
      legalBasis: item.legalBasis,
      doneAt,
      performedBy,
      result,
      findings,
      actions,
      cost,
      vendor: item.vendor,
    },
  });

  await rollForward(tenantId, item.id, doneAt);

  revalidatePath("/modules/facilities");
  redirect(`/modules/facilities/${doc.id}`);
}

/**
 * lastDoneAt 롤오버 + 열린 작업지시 닫기.
 * 조건부 updateMany — 앵커는 **앞으로만** 간다: 지난 기록을 뒤늦게 등록해도
 * (백필) 이미 더 최근 실시일이 있으면 도래일이 과거로 되돌아가지 않는다.
 */
async function rollForward(tenantId: string, itemId: string, doneAtYmd: string) {
  const doneAtDate = new Date(`${doneAtYmd}T00:00:00+09:00`);
  await db.inspectionItem.updateMany({
    where: {
      id: itemId,
      tenantId,
      OR: [{ lastDoneAt: null }, { lastDoneAt: { lt: doneAtDate } }],
    },
    data: { lastDoneAt: doneAtDate },
  });
  // 크론이 만든 이 항목의 작업지시는 처리 완료로 — 할 일 위젯에서 내려간다
  await db.document.updateMany({
    where: {
      tenantId,
      type: TYPE,
      status: "scheduled",
      meta: { path: ["itemId"], equals: itemId },
    },
    data: { status: "done" },
  });
}

/**
 * 폐기 — 완성본은 목록에 '폐기'로 남고 열람만 된다(교육일지와 같은 규칙).
 * 앵커는 되돌리지 않는다 — 실시일이 잘못됐으면 [항목 관리]에서 기준일을 고친다.
 */
export async function voidInspectionRecord(docId: string) {
  const session = await requireInspection();
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId: session.tenantId!, type: TYPE, moduleId: MODULE_ID },
  });
  if (!doc) return { error: "문서를 찾을 수 없습니다." };
  // 문서 수정·폐기의 공통 경계 — 작성자 본인 또는 마스터
  if (doc.createdById !== session.userId && session.role !== Role.DIRECTOR)
    return { error: "폐기는 작성자 또는 마스터만 할 수 있습니다." };
  await db.document.updateMany({
    where: { id: doc.id, status: { not: "void" } },
    data: { status: "void" },
  });
  revalidatePath("/modules/facilities");
  redirect("/modules/facilities");
}

// ── 첨부 — 성적서·검사필증 PDF·사진 (견적서 첨부 인프라 재사용) ──

/**
 * 점검 기록 첨부 — 성적서는 점검 **뒤에** 도착하므로 완성본에도 올릴 수 있다
 * (견적서와 다른 점 — 그쪽은 결재 시작 전만). 폐기본만 막는다.
 */
export async function uploadInspectionFile(
  _prev: RecordState,
  formData: FormData,
): Promise<RecordState> {
  const session = await requireInspection();
  const docId = String(formData.get("docId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { error: "파일을 선택해 주세요." };
  if (!allowedMime(file.type))
    return { error: "이미지 또는 PDF만 첨부할 수 있습니다." };
  if (file.size > MAX_FILE_BYTES)
    return { error: "3MB 이하만 첨부할 수 있습니다. 종이 서류는 사진으로 찍어 올리면 자동으로 줄어듭니다." };

  const doc = await db.document.findFirst({
    where: { id: docId, tenantId: session.tenantId!, type: TYPE, moduleId: MODULE_ID },
  });
  if (!doc) return { error: "문서를 찾을 수 없습니다." };
  if (doc.status === "void") return { error: "폐기된 기록에는 첨부할 수 없습니다." };

  if (
    (await db.documentAttachment.count({ where: { documentId: doc.id } })) >=
    MAX_FILES_PER_DOC
  )
    return { error: `문서당 ${MAX_FILES_PER_DOC}장까지 첨부할 수 있습니다.` };

  const buf = Buffer.from(await file.arrayBuffer());
  await db.documentAttachment.create({
    data: {
      documentId: doc.id,
      quoteIndex: null,
      name: file.name,
      mime: file.type,
      size: buf.byteLength,
      sha256: crypto.createHash("sha256").update(buf).digest("hex"),
      data: buf,
    },
  });
  revalidatePath(`/modules/facilities/${doc.id}`);
  return undefined;
}

export async function deleteInspectionFile(attachmentId: string): Promise<RecordState> {
  const session = await requireInspection();
  const att = await db.documentAttachment.findUnique({
    where: { id: attachmentId },
    include: {
      document: { select: { id: true, tenantId: true, status: true, moduleId: true } },
    },
  });
  if (
    !att ||
    att.document.tenantId !== session.tenantId ||
    att.document.moduleId !== MODULE_ID
  )
    return { error: "파일을 찾을 수 없습니다." };
  if (att.document.status === "void")
    return { error: "폐기된 기록의 첨부는 지울 수 없습니다." };
  await db.documentAttachment.delete({ where: { id: attachmentId } });
  revalidatePath(`/modules/facilities/${att.document.id}`);
  return undefined;
}
