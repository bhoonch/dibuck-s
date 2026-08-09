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
import { ymdKst } from "@/lib/utils";
import {
  allowedMime,
  MAX_FILE_BYTES,
  MAX_FILES_PER_DOC,
} from "@/lib/gian/attachments";
import {
  EQUIPMENT_CATEGORIES,
  equipKey,
  parseEquipmentRows,
  parseHistoryRows,
} from "@/lib/repairs";

const MODULE_ID = "repairs";
const TYPE = "repair";

/** 상태를 바꾸는 함수의 공통 입구 — 화면 가드를 믿지 않고 여기서 다시 검사한다 */
async function requireRepairs() {
  const session = await requireTenantSession();
  if (!(await isSubscribed(session.tenantId!, MODULE_ID)))
    throw new Error("설비·수선 이력 모듈을 구독 중이 아닙니다.");
  return session;
}

/** 대장 관리는 명부와 같은 경계 — 마스터·매니저 */
async function requireEquipAdmin() {
  const session = await requireRepairs();
  if (session.role !== Role.DIRECTOR && session.role !== Role.ACCOUNTANT)
    return {
      error: "설비 대장 관리는 마스터·매니저만 할 수 있습니다." as const,
    };
  return { session };
}

/**
 * "YYYY-MM-DD" 또는 "YYYY" → KST 00:00. 빈 값 null.
 * new Date("2026-07-20")은 UTC 자정이라 한국 시각으론 전날 09:00 — 하루 밀린다
 * (facilities kstDateOf와 같은 함정).
 */
const kstDateOf = (v: string | undefined | null) => {
  const t = (v ?? "").trim();
  const ymd = /^\d{4}$/.test(t) ? `${t}-01-01` : t;
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd)
    ? new Date(`${ymd}T00:00:00+09:00`)
    : null;
};

const normalizeCategory = (v: string) =>
  (EQUIPMENT_CATEGORIES as readonly string[]).includes(v) ? v : "기타";

// ── 설비 대장 — Equipment 테이블 ─────────────────────────────

export async function addEquipment(input: {
  name: string;
  category: string;
  location?: string;
  installedAt?: string;
  vendor?: string;
  note?: string;
}) {
  const gate = await requireEquipAdmin();
  if ("error" in gate) return gate;
  const name = input.name.trim();
  if (!name) return { error: "설비 이름을 입력해 주세요." };
  await db.equipment.create({
    data: {
      tenantId: gate.session.tenantId!,
      name,
      category: normalizeCategory(input.category),
      location: input.location?.trim() || null,
      installedAt: kstDateOf(input.installedAt),
      vendor: input.vendor?.trim() || null,
      note: input.note?.trim() || null,
    },
  });
  revalidatePath("/modules/repairs/equipment");
  return {};
}

export async function updateEquipment(input: {
  id: string;
  name: string;
  category: string;
  location: string;
  installedAt: string;
  vendor: string;
  note: string;
}) {
  const gate = await requireEquipAdmin();
  if ("error" in gate) return gate;
  const name = input.name.trim();
  if (!name) return { error: "설비 이름을 입력해 주세요." };
  // tenantId를 조건에 넣는다 — 남의 단지 설비 id로는 아무 행도 맞지 않는다
  await db.equipment.updateMany({
    where: { id: input.id, tenantId: gate.session.tenantId! },
    data: {
      name,
      category: normalizeCategory(input.category),
      location: input.location.trim() || null,
      installedAt: kstDateOf(input.installedAt),
      vendor: input.vendor.trim() || null,
      note: input.note.trim() || null,
    },
  });
  revalidatePath("/modules/repairs/equipment");
  return {};
}

/** 폐기는 삭제가 아니라 비활성 — 수선 기록의 설비 연결이 허공에 뜨면 안 된다 */
export async function setEquipmentActive(id: string, active: boolean) {
  const gate = await requireEquipAdmin();
  if ("error" in gate) return gate;
  await db.equipment.updateMany({
    where: { id, tenantId: gate.session.tenantId! },
    data: { active },
  });
  revalidatePath("/modules/repairs/equipment");
  return {};
}

/** 업로드 폼 공통 — 엑셀 파일을 행 배열로. 실패는 error 문자열 */
async function readSheet(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { error: "파일을 선택해 주세요." as const };
  if (file.size > 5 * 1024 * 1024)
    return { error: "5MB 이하 파일만 업로드할 수 있습니다." as const };
  const XLSX = await import("xlsx");
  try {
    const wb = XLSX.read(await file.arrayBuffer());
    return {
      rows: XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
        header: 1,
        raw: false,
      }) as unknown[][],
    };
  } catch {
    return {
      error:
        "파일을 읽을 수 없습니다. 엑셀(.xlsx) 파일인지 확인해 주세요." as const,
    };
  }
}

export type UploadState = {
  error?: string;
  success?: string;
  /** 대장에서 못 찾은 설비명 — 토스트는 사라지므로 화면에 남겨 둔다 */
  unmatched?: string[];
};

export async function uploadEquipmentExcel(
  _prev: UploadState | undefined,
  formData: FormData,
): Promise<UploadState> {
  const gate = await requireEquipAdmin();
  if ("error" in gate) return { error: gate.error };
  const tenantId = gate.session.tenantId!;

  const sheet = await readSheet(formData);
  if ("error" in sheet) return { error: sheet.error };
  const parsed = parseEquipmentRows(sheet.rows);
  if ("error" in parsed) return parsed;
  // 같은 파일 안 중복 이름은 뒤엣것만 (세대 업로드와 같은 판단).
  // 비교는 equipKey — 공백만 다른 이름이 두 대로 등록되면, 이력 이관이 어느 쪽에
  // 붙일지 알 수 없어 그 설비의 기록이 통째로 미지정이 된다.
  const unique = [
    ...new Map(parsed.rows.map((r) => [equipKey(r.name), r])).values(),
  ];
  const toRow = (r: (typeof unique)[number]) => ({
    ...r,
    tenantId,
    installedAt: kstDateOf(r.installedAt),
  });

  const replace = formData.get("replace") === "on";
  if (replace) {
    // ⚠️ Unit과 다른 점: Equipment id는 수선 기록의 meta.equipmentId가 참조한다.
    // 교체로 id가 새로 발급되면 모든 기록의 설비 연결이 고아가 된다 — 기록이 있으면 막는다.
    const linked = await db.document.count({ where: { tenantId, type: TYPE } });
    if (linked > 0)
      return {
        error:
          "수선 기록이 있는 단지는 전체 교체를 할 수 없습니다.\n기록과 설비의 연결이 끊어집니다. 교체 없이 올리면 새 설비만 추가됩니다.",
      };
    await db.$transaction(async (tx) => {
      await tx.equipment.deleteMany({ where: { tenantId } });
      await tx.equipment.createMany({ data: unique.map(toRow) });
    });
    revalidatePath("/modules/repairs/equipment");
    return { success: `설비 ${unique.length}대를 등록했습니다.` };
  }

  // 추가 모드 — 이미 있는 이름은 건너뛴다(id 보존). 수정은 화면에서.
  const existing = await db.equipment.findMany({
    where: { tenantId },
    select: { name: true },
  });
  const have = new Set(existing.map((e) => equipKey(e.name)));
  const fresh = unique.filter((r) => !have.has(equipKey(r.name)));
  if (fresh.length > 0)
    await db.equipment.createMany({ data: fresh.map(toRow) });
  revalidatePath("/modules/repairs/equipment");
  const skipped = unique.length - fresh.length;
  return {
    success:
      `설비 ${fresh.length}대를 추가했습니다.` +
      (skipped > 0 ? ` 이미 있는 ${skipped}대는 건너뛰었습니다.` : ""),
  };
}

/** 문서함 검색용 평문 */
const repairPlainText = (m: {
  equipmentName: string | null;
  symptom: string;
  action: string;
  vendor: string;
}) =>
  [m.equipmentName, m.symptom, m.action, m.vendor].filter(Boolean).join("\n");

/**
 * 과거 수선 이력 엑셀 이관 — **추가만 한다.** 세대 업로드의 삭제-재삽입과 다른 점:
 * 기존 수선 기록은 증빙이라 업로드가 날리면 안 된다. 같은 파일을 두 번 올리면
 * 두 벌이 생긴다 — 화면 문구로 알리고, 정리는 기록 폐기로 한다.
 * 이관 기록은 채번하지 않는다(docNo null + meta.imported) — 과거 수선에 올해
 * 번호를 붙이면 대장이 거짓말을 한다.
 */
export async function uploadRepairHistory(
  _prev: UploadState | undefined,
  formData: FormData,
): Promise<UploadState> {
  const gate = await requireEquipAdmin();
  if ("error" in gate) return { error: gate.error };
  const tenantId = gate.session.tenantId!;

  const sheet = await readSheet(formData);
  if ("error" in sheet) return { error: sheet.error };
  const parsed = parseHistoryRows(sheet.rows);
  if ("error" in parsed) return parsed;

  // 설비명 → id 매칭 (이름이 대장에 없으면 미지정 기록으로 들어간다).
  // 키가 겹치는 설비가 대장에 둘 있으면 null로 둔다 — 어느 쪽인지 알 수 없는데
  // 아무 쪽에나 붙이면 그 설비의 이력·비용이 조용히 틀린다. 미지정이 정직하다.
  const equipment = await db.equipment.findMany({
    where: { tenantId },
    select: { id: true, name: true },
  });
  const byKey = new Map<string, { id: string; name: string } | null>();
  for (const e of equipment) {
    const k = equipKey(e.name);
    byKey.set(k, byKey.has(k) ? null : e);
  }
  const match = (name: string | null) =>
    name ? byKey.get(equipKey(name)) : null;

  await db.document.createMany({
    data: parsed.rows.map((r) => {
      const eq = match(r.equipmentName);
      const meta = {
        equipmentId: eq?.id ?? null,
        equipmentName: eq?.name ?? r.equipmentName,
        symptom: r.symptom,
        action: r.action ?? "",
        vendor: r.vendor ?? "",
        cost: r.cost,
        startedAt: r.startedAt,
        completedAt: r.startedAt, // 과거 이력은 끝난 일이다
        imported: true,
      };
      return {
        tenantId,
        moduleId: MODULE_ID,
        type: TYPE,
        docNo: null,
        title: meta.equipmentName
          ? `${meta.equipmentName} ${r.symptom}`
          : r.symptom,
        content: repairPlainText(meta),
        status: "done",
        createdById: gate.session.userId,
        meta,
      };
    }),
  });
  // 못 붙은 설비명은 개수만 알려주면 사용자가 고칠 방법이 없다 — 이름 자체를 돌려준다
  const unmatched = [
    ...new Set(
      parsed.rows
        .filter((r) => r.equipmentName && !match(r.equipmentName))
        .map((r) => r.equipmentName!),
    ),
  ];
  revalidatePath("/modules/repairs");
  revalidatePath("/modules/repairs/equipment");
  return {
    success:
      `이력 ${parsed.rows.length}건을 가져왔습니다.` +
      (unmatched.length > 0
        ? ` 설비 ${unmatched.length}종은 대장에서 찾지 못해 미지정으로 들어갔습니다.`
        : ""),
    unmatched,
  };
}

// ── 수선 기록 — Document(type: repair) ──────────────────────

export type RecordState = { error?: string } | undefined;

/**
 * 수선 기록 저장 — 초안 없음, 저장 즉시 채번(작문·검토가 없는 즉시 기록 — 스펙 확정).
 * 조치까지 끝났으면 done, 아니면 open(조치 중).
 * pending을 쓰지 않는 이유: 문서함이 "결재 대기"로 읽는다(labels.ts의 함정).
 */
export async function createRepairRecord(
  _prev: RecordState,
  formData: FormData,
): Promise<RecordState> {
  // 문서를 만드는 입구 — 화면 가드를 믿지 않고 여기서 다시 검사한다
  const session = await requireRepairs();
  const tenantId = session.tenantId!;

  const symptom = String(formData.get("symptom") ?? "").trim();
  if (!symptom) return { error: "증상을 입력해 주세요." };
  const startedAt = String(formData.get("startedAt") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startedAt))
    return { error: "발생일을 입력해 주세요." };

  // 설비 미지정 허용 — 기록 문턱이 낮은 게 이 모듈의 생명 (스펙 확정)
  const equipmentId = String(formData.get("equipmentId") ?? "") || null;
  const equipment = equipmentId
    ? await db.equipment.findFirst({ where: { id: equipmentId, tenantId } })
    : null;
  if (equipmentId && !equipment)
    return {
      error: "설비를 찾을 수 없습니다. 새로고침 후 다시 시도해 주세요.",
    };

  const done = formData.get("done") === "on";
  const meta = {
    equipmentId: equipment?.id ?? null,
    // 이름 스냅샷 — 설비를 나중에 고쳐도 지난 기록의 표기는 불변(점검 기록과 같은 원칙)
    equipmentName: equipment?.name ?? null,
    symptom,
    action: String(formData.get("action") ?? "").trim(),
    vendor: String(formData.get("vendor") ?? "").trim(),
    cost: parseWon(formData.get("cost")),
    startedAt,
    completedAt: done ? startedAt : null,
  };

  // 파일은 문서를 만들기 전에 검사한다 — 반려됐는데 문서만 생기면 중복 기록이 된다
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_FILES_PER_DOC)
    return { error: `첨부는 ${MAX_FILES_PER_DOC}장까지 올릴 수 있습니다.` };
  for (const f of files) {
    if (!allowedMime(f.type))
      return { error: "이미지 또는 PDF만 첨부할 수 있습니다." };
    if (f.size > MAX_FILE_BYTES)
      return { error: `${f.name} 파일은 3MB 이하만 첨부할 수 있습니다.` };
  }

  const doc = await createDocument({
    tenantId,
    moduleId: MODULE_ID,
    type: TYPE,
    title: meta.equipmentName ? `${meta.equipmentName} ${symptom}` : symptom,
    content: repairPlainText(meta),
    status: done ? "done" : "open",
    createdById: session.userId,
    meta,
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

  revalidatePath("/modules/repairs");
  // replace — 뒤로가기의 낡은 폼 재제출 방지(점검 기록과 같은 이유)
  redirect(`/modules/repairs/${doc.id}`, RedirectType.replace);
}

/** 조치 완료 — 조건부 updateMany: 이미 완료·폐기된 기록은 아무 행도 맞지 않는다 */
export async function completeRepairRecord(docId: string) {
  const session = await requireRepairs();
  const doc = await db.document.findFirst({
    where: {
      id: docId,
      tenantId: session.tenantId!,
      type: TYPE,
      moduleId: MODULE_ID,
    },
  });
  if (!doc) return { error: "기록을 찾을 수 없습니다." };
  await db.document.updateMany({
    where: { id: doc.id, status: "open" },
    data: {
      status: "done",
      meta: { ...(doc.meta as object), completedAt: ymdKst(new Date()) },
    },
  });
  revalidatePath("/modules/repairs");
  revalidatePath(`/modules/repairs/${doc.id}`);
  return {};
}

/** 폐기 — 완성본은 목록에 '폐기'로 남고 열람만 된다(점검 기록과 같은 규칙·경계) */
export async function voidRepairRecord(docId: string) {
  const session = await requireRepairs();
  const doc = await db.document.findFirst({
    where: {
      id: docId,
      tenantId: session.tenantId!,
      type: TYPE,
      moduleId: MODULE_ID,
    },
  });
  if (!doc) return { error: "기록을 찾을 수 없습니다." };
  // 문서 수정·폐기의 공통 경계 — 작성자 본인 또는 마스터
  if (doc.createdById !== session.userId && session.role !== Role.DIRECTOR)
    return { error: "폐기는 작성자 또는 마스터만 할 수 있습니다." };
  await db.document.updateMany({
    where: { id: doc.id, status: { not: "void" } },
    data: { status: "void" },
  });
  revalidatePath("/modules/repairs");
  redirect("/modules/repairs");
}

/** 미지정 기록을 설비에 연결 — 잡수선으로 시작한 기록도 이력 카드에 실리게 */
export async function linkRepairToEquipment(
  docId: string,
  equipmentId: string,
) {
  const session = await requireRepairs();
  const tenantId = session.tenantId!;
  const [doc, equipment] = await Promise.all([
    db.document.findFirst({
      where: { id: docId, tenantId, type: TYPE, moduleId: MODULE_ID },
    }),
    db.equipment.findFirst({ where: { id: equipmentId, tenantId } }),
  ]);
  if (!doc || !equipment)
    return { error: "기록 또는 설비를 찾을 수 없습니다." };
  if (doc.status === "void")
    return { error: "폐기된 기록은 수정할 수 없습니다." };
  const meta = doc.meta as { symptom?: string };
  await db.document.update({
    where: { id: doc.id },
    data: {
      title: `${equipment.name} ${meta.symptom ?? ""}`.trim(),
      meta: {
        ...(doc.meta as object),
        equipmentId: equipment.id,
        equipmentName: equipment.name,
      },
    },
  });
  revalidatePath(`/modules/repairs/${doc.id}`);
  return {};
}

// ── 첨부 — 사진·영수증 (점검 기록 첨부와 같은 규칙: 완성본에도 올린다) ──

/** 영수증·세금계산서는 수선 뒤에 도착한다 — 완성본에도 올릴 수 있고 폐기본만 막는다 */
export async function uploadRepairFile(
  _prev: RecordState,
  formData: FormData,
): Promise<RecordState> {
  const session = await requireRepairs();
  const docId = String(formData.get("docId") ?? "");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { error: "파일을 선택해 주세요." };
  if (!allowedMime(file.type))
    return { error: "이미지 또는 PDF만 첨부할 수 있습니다." };
  if (file.size > MAX_FILE_BYTES)
    return {
      error:
        "3MB 이하만 첨부할 수 있습니다. 종이 서류는 사진으로 찍어 올리면 자동으로 줄어듭니다.",
    };

  const doc = await db.document.findFirst({
    where: {
      id: docId,
      tenantId: session.tenantId!,
      type: TYPE,
      moduleId: MODULE_ID,
    },
  });
  if (!doc) return { error: "기록을 찾을 수 없습니다." };
  if (doc.status === "void")
    return { error: "폐기된 기록에는 첨부할 수 없습니다." };

  if (
    (await db.documentAttachment.count({ where: { documentId: doc.id } })) >=
    MAX_FILES_PER_DOC
  )
    return { error: `기록당 ${MAX_FILES_PER_DOC}장까지 첨부할 수 있습니다.` };

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
  revalidatePath(`/modules/repairs/${doc.id}`);
  return undefined;
}

export async function deleteRepairFile(
  attachmentId: string,
): Promise<RecordState> {
  const session = await requireRepairs();
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
    att.document.moduleId !== MODULE_ID
  )
    return { error: "파일을 찾을 수 없습니다." };
  if (att.document.status === "void")
    return { error: "폐기된 기록의 첨부는 지울 수 없습니다." };
  await db.documentAttachment.delete({ where: { id: attachmentId } });
  revalidatePath(`/modules/repairs/${att.document.id}`);
  return undefined;
}
