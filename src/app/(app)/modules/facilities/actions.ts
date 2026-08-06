"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { RedirectType, redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { createDocument } from "@/lib/documents";
import { isSubscribed } from "@/lib/modules";
import { parseWon } from "@/lib/won";
import { allowedMime, MAX_FILE_BYTES, MAX_FILES_PER_DOC } from "@/lib/gian/attachments";
import {
  CYCLE_CHOICES,
  PLAYGROUND_SCOPE,
  WIZARD_QUESTIONS,
  catalogItemOf,
  isPlayground,
  needsFindings,
  resultChoicesOf,
  worstResult,
} from "@/lib/inspection/catalog";
import { cycleToRow, followupOf } from "@/lib/inspection/schedule";
import { kstDayStart } from "@/lib/utils";

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

  const fields = readRecordFields(formData, item.presetKey);
  if ("error" in fields) return fields;

  // 파일은 문서를 만들기 **전에** 검사한다 — 파일이 반려됐는데 문서만 생기면
  // 사용자는 저장이 실패한 줄 알고 한 번 더 저장한다(중복 기록)
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_FILES_PER_DOC)
    return { error: `첨부는 ${MAX_FILES_PER_DOC}장까지 올릴 수 있습니다.` };
  for (const f of files) {
    if (!allowedMime(f.type))
      return { error: "이미지 또는 PDF만 첨부할 수 있습니다." };
    if (f.size > MAX_FILE_BYTES)
      return { error: `${f.name} — 3MB 이하만 첨부할 수 있습니다.` };
  }

  const doc = await createDocument({
    tenantId,
    moduleId: MODULE_ID,
    type: TYPE,
    title: `${item.name} (${fields.doneAt})`,
    content: recordPlainText(item.name, item.legalBasis, fields),
    status: "final",
    createdById: session.userId,
    // 항목명·근거 스냅샷 — 항목을 나중에 고쳐도 지난 증빙은 불변(교육일지 참석자와 같은 원칙)
    meta: {
      itemId: item.id,
      itemName: item.name,
      legalBasis: item.legalBasis,
      ...fields,
      // 법정 점검 범위도 스냅샷 — 카탈로그를 고쳐도 지난 일지의 문구는 불변
      scope: isPlayground(item.presetKey) ? PLAYGROUND_SCOPE : "",
      vendor: item.vendor,
    },
  });

  for (const f of files) {
    const buf = Buffer.from(await f.arrayBuffer());
    await db.documentAttachment.create({
      data: {
        documentId: doc.id,
        quoteIndex: null,
        name: f.name,
        mime: f.type,
        size: buf.byteLength,
        sha256: crypto.createHash("sha256").update(buf).digest("hex"),
        data: buf,
      },
    });
  }

  await rollForward(tenantId, item.id, fields.doneAt);
  try {
    await createFollowupOrder(
      tenantId,
      session.userId,
      item,
      doc.id,
      fields.result,
      fields.doneAt,
    );
  } catch (e) {
    // 기록은 이미 확정됐다 — 조치는 [이상 판정] 화면에서 다시 만들 수 있다
    console.error("[inspection] 후속 조치 작업지시 생성 실패", e);
  }

  revalidatePath("/modules/facilities");
  // replace — 뒤로가기가 방금 쓴 폼으로 돌아가면 입력이 그대로 남아 있어(Next가
  // back/forward에서 페이지를 재사용한다) 한 번 더 저장 시 중복 기록이 된다.
  // 히스토리에서 폼 자체를 지워 뒤로가기가 현황판으로 가게 한다
  redirect(`/modules/facilities/${doc.id}`, RedirectType.replace);
}

/**
 * 작성·수정이 같은 검증을 쓴다 — 폼 값 → meta 필드. error면 저장하지 않는다.
 *
 * 판정어는 항목이 정한다(놀이시설만 4단계). 대표 판정은 폼이 보낸 값을 믿지 않고
 * **기구별 판정에서 다시 계산한다** — 클라이언트 계산을 그대로 저장하면 목록에는
 * 양호인데 안에는 이용금지 기구가 있는 기록이 만들어질 수 있다.
 */
function readRecordFields(formData: FormData, presetKey?: string | null) {
  const doneAt = String(formData.get("doneAt") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(doneAt))
    return { error: "실시일자를 입력해 주세요." as const };
  const performedBy = String(formData.get("performedBy") ?? "").trim() || "자체";
  const choices = resultChoicesOf(presetKey);

  const units = parseUnits(formData.get("units"), choices);
  if ("error" in units) return units;
  if (isPlayground(presetKey) && units.rows.length === 0)
    return { error: "놀이기구를 한 대 이상 넣고 판정해 주세요." as const };

  const sent = String(formData.get("result") ?? "");
  const result =
    units.rows.length > 0
      ? worstResult(units.rows.map((u) => u.result), choices)
      : choices.includes(sent)
        ? sent
        : choices[0];

  const findings = String(formData.get("findings") ?? "").trim();
  const actions = String(formData.get("actions") ?? "").trim();
  if (needsFindings(result) && !findings)
    return { error: "지적 내용을 입력해 주세요." as const };

  return {
    doneAt,
    performedBy,
    result,
    units: units.rows,
    barrier: result === "이용금지" && formData.get("barrier") != null,
    findings,
    actions,
    cost: parseWon(formData.get("cost")),
  };
}

/** 기구별 판정 — 이름이 빈 행은 버린다(추가만 하고 안 적은 줄) */
type Unit = { name: string; result: string };
function parseUnits(
  raw: FormDataEntryValue | null,
  choices: string[],
): { rows: Unit[] } | { error: string } {
  if (typeof raw !== "string" || !raw.trim()) return { rows: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "놀이기구 판정을 읽지 못했습니다. 새로고침 후 다시 시도해 주세요." as const };
  }
  if (!Array.isArray(parsed)) return { rows: [] };
  const rows = parsed
    .map((u) => ({
      name: String((u as { name?: unknown })?.name ?? "").trim(),
      result: String((u as { result?: unknown })?.result ?? ""),
    }))
    .filter((u) => u.name);
  if (rows.some((u) => !choices.includes(u.result)))
    return { error: "기구마다 판정을 골라 주세요." as const };
  return { rows };
}

/**
 * 이상 판정의 후속 조치 작업지시 — 이용금지는 **법정 1개월**(안전진단 신청),
 * 요수리는 앱 기본 30일. 결정적 코드, LLM 없음.
 *
 * 파생 실패는 삼킨다 — 작업지시는 다시 만들 수 있지만 점검 기록이 롤백되면
 * 현장에서 이미 한 점검을 다시 입력해야 한다(공고문 파생과 같은 판단).
 *
 * `kind: "action"`이라 크론의 주기 작업지시(`kind: "workorder"`)와 섞이지 않는다 —
 * 다음 달 점검 기록이 저장돼도 이 조치는 자동으로 닫히지 않는다. 안전진단 신청은
 * 다음 점검과 별개 절차라 사람이 [조치 완료]를 눌러야 끝난다.
 */
async function createFollowupOrder(
  tenantId: string,
  userId: string,
  item: { id: string; name: string },
  sourceDocId: string,
  result: string,
  doneAt: string,
) {
  const f = followupOf(result, doneAt);
  if (!f) return;
  // 이 기록에서 이미 만든 조치가 있으면 그만 — 수정 저장이 중복을 만들면 안 된다
  const open = await db.document.findFirst({
    where: {
      tenantId,
      type: TYPE,
      status: "scheduled",
      meta: { path: ["sourceDocId"], equals: sourceDocId },
    },
    select: { id: true },
  });
  if (open) return;
  await createDocument({
    tenantId,
    moduleId: MODULE_ID,
    type: TYPE,
    title: `${item.name} ${f.title} (${f.dueYmd}까지)`,
    content: [item.name, `${f.title} 기한 ${f.dueYmd}`, f.note].join("\n"),
    status: "scheduled",
    // 조치도 증빙이 아니라 할 일이다 — 번호를 주면 점검 대장에 결번이 남는다
    numberOnSubmit: true,
    dueDate: kstDayStart(f.dueYmd),
    createdById: userId,
    meta: {
      itemId: item.id,
      itemName: item.name,
      dueYmd: f.dueYmd,
      kind: "action",
      sourceDocId,
      result,
      legal: f.legal,
      note: f.note,
    },
  });
}

/** 문서함 검색용 평문 */
const recordPlainText = (
  itemName: string,
  legalBasis: string,
  f: { result: string; findings: string; actions: string },
) =>
  [itemName, legalBasis, `결과: ${f.result}`, f.findings, f.actions]
    .filter(Boolean)
    .join("\n");

/**
 * 내용 수정 — 작성자·마스터, 폐기 전까지(교육일지도 완성본 수정이 되는 결).
 * 항목은 바꿀 수 없다 — 항목을 잘못 골랐으면 폐기 후 새로 쓴다(스냅샷·앵커가 얽힌다).
 * 실시일이 바뀌면 앵커를 기록들로부터 재계산한다.
 */
export async function saveInspectionRecord(
  _prev: RecordState,
  formData: FormData,
): Promise<RecordState> {
  const session = await requireInspection();
  const docId = String(formData.get("docId") ?? "");
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId: session.tenantId!, type: TYPE, moduleId: MODULE_ID },
  });
  if (!doc) return { error: "문서를 찾을 수 없습니다." };
  if (doc.status === "void") return { error: "폐기된 기록은 수정할 수 없습니다." };
  // 문서 수정·폐기의 공통 경계 — 작성자 본인 또는 마스터
  if (doc.createdById !== session.userId && session.role !== Role.DIRECTOR)
    return { error: "수정은 작성자 또는 마스터만 할 수 있습니다." };

  const meta = (doc.meta ?? {}) as {
    itemId?: string;
    itemName?: string;
    legalBasis?: string;
  };
  // 판정어는 항목이 정한다 — 스냅샷에는 없으므로 항목에서 읽는다
  const item = meta.itemId
    ? await db.inspectionItem.findFirst({
        where: { id: meta.itemId, tenantId: session.tenantId! },
        select: { id: true, name: true, presetKey: true },
      })
    : null;

  const fields = readRecordFields(formData, item?.presetKey);
  if ("error" in fields) return fields;

  await db.document.update({
    where: { id: doc.id },
    data: {
      title: `${meta.itemName ?? doc.title} (${fields.doneAt})`,
      content: recordPlainText(meta.itemName ?? "", meta.legalBasis ?? "", fields),
      // 항목 스냅샷(itemId·itemName·legalBasis·vendor)은 그대로 두고 입력값만 바꾼다
      meta: { ...(doc.meta as object), ...fields },
    },
  });
  if (meta.itemId) await recomputeAnchor(session.tenantId!, meta.itemId);
  if (item)
    try {
      // 수정으로 이상 판정이 된 기록에도 기한이 붙어야 한다 (이미 있으면 건너뛴다)
      await createFollowupOrder(
        session.tenantId!,
        session.userId,
        item,
        doc.id,
        fields.result,
        fields.doneAt,
      );
    } catch (e) {
      console.error("[inspection] 후속 조치 작업지시 생성 실패", e);
    }

  revalidatePath("/modules/facilities");
  revalidatePath(`/modules/facilities/${doc.id}`);
  // replace — 작성과 같은 이유(뒤로가기의 낡은 수정 폼)
  redirect(`/modules/facilities/${doc.id}`, RedirectType.replace);
}

/**
 * 앵커 재계산 — 수정·폐기 뒤에는 "앞으로만"(rollForward)으로는 부족하다:
 * 실시일을 당기거나 기록을 폐기하면 도래일이 **뒤로** 돌아가야 정직하다.
 * 완성 기록의 실시일 최대값으로 다시 놓는다. 기록이 하나도 없으면 손대지 않는다 —
 * 마법사에서 손으로 넣은 기준일일 수 있고, 그 값이 틀렸는지는 앱이 알 수 없다.
 */
async function recomputeAnchor(tenantId: string, itemId: string) {
  const records = await db.document.findMany({
    where: {
      tenantId,
      type: TYPE,
      status: "final",
      meta: { path: ["itemId"], equals: itemId },
    },
    select: { meta: true },
  });
  const dates = records
    .map((r) => (r.meta as { doneAt?: string })?.doneAt)
    .filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const last = dates.at(-1);
  if (!last) return;
  await db.inspectionItem.updateMany({
    where: { id: itemId, tenantId },
    data: { lastDoneAt: new Date(`${last}T00:00:00+09:00`) },
  });
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
  // 크론이 만든 이 항목의 주기 작업지시는 처리 완료로 — 할 일 위젯에서 내려간다.
  // kind로 **긍정 필터**한다 — `{ not: "action" }`은 kind가 없는 옛 행을 제외해 버린다.
  // 이상 판정의 조치(kind: "action")는 여기서 닫지 않는다: 안전진단 신청은 다음 달
  // 점검과 별개 절차라, 다음 점검 기록이 조치를 대신 끝낸 것으로 만들면 안 된다.
  await db.document.updateMany({
    where: {
      tenantId,
      type: TYPE,
      status: "scheduled",
      AND: [
        { meta: { path: ["itemId"], equals: itemId } },
        { meta: { path: ["kind"], equals: "workorder" } },
      ],
    },
    data: { status: "done" },
  });
}

/**
 * 이상 판정 조치 마감 — 안전진단 신청·수리를 마쳤을 때 사람이 누른다.
 * 자동 마감이 없는 이유는 rollForward 주석 참조(다음 점검이 조치를 대신하지 않는다).
 */
export async function completeInspectionAction(docId: string) {
  const session = await requireInspection();
  await db.document.updateMany({
    where: {
      id: docId,
      tenantId: session.tenantId!,
      type: TYPE,
      status: "scheduled",
    },
    data: { status: "done" },
  });
  revalidatePath("/modules/facilities");
  revalidatePath(`/modules/facilities/${docId}`);
  return {};
}

/**
 * 폐기 — 완성본은 목록에 '폐기'로 남고 열람만 된다(교육일지와 같은 규칙).
 * 폐기한 기록은 이행에서 빠지므로 앵커를 재계산한다 — 유일한 기록을 폐기하면
 * 앵커는 마지막으로 알던 값에 남는다(재계산 주석 참조).
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
  const itemId = (doc.meta as { itemId?: string })?.itemId;
  if (itemId) await recomputeAnchor(session.tenantId!, itemId);
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
