"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { createDocument } from "@/lib/documents";
import {
  latestPerUnit,
  parseDunningRows,
  suggestStage,
  type DunningRow,
  type DunningStage,
} from "@/lib/dunning";
import { isSubscribed } from "@/lib/modules";
import { ymdKst } from "@/lib/utils";

export type PreparedRow = DunningRow & { suggestedStage: DunningStage };

/** 독촉은 부과·수납 실무 — 세대 명부 업로드와 같은 권한 + 구독 검사 */
async function requireDunning() {
  const session = await requireRole(Role.DIRECTOR, Role.ACCOUNTANT);
  if (!(await isSubscribed(session.tenantId!, "dunning")))
    throw new Error("미납 독촉장 모듈을 구독 중이 아닙니다.");
  return session;
}

/** 이름은 세대명부에서, 단계는 발송 이력에서 채운다 — 엑셀·직접 입력 공용 */
async function prepareRows(
  tenantId: string,
  rows: DunningRow[],
): Promise<PreparedRow[]> {
  const or = rows.map((r) => ({ dong: r.dong, ho: r.ho }));
  const [units, entries] = await Promise.all([
    db.unit.findMany({
      where: { tenantId, OR: or },
      select: { dong: true, ho: true, name: true },
    }),
    db.dunningEntry.findMany({
      // 폐기된 회차는 없던 발송 — 단계 제안에 세지 않는다
      where: { tenantId, OR: or, document: { status: "final" } },
      orderBy: { createdAt: "desc" },
      select: { dong: true, ho: true, stage: true, paidAt: true },
    }),
  ]);
  const nameOf = new Map(units.map((u) => [`${u.dong}/${u.ho}`, u.name]));
  const last = new Map(
    latestPerUnit(entries).map((e) => [`${e.dong}/${e.ho}`, e]),
  );
  return rows.map((r) => ({
    ...r,
    name: r.name ?? nameOf.get(`${r.dong}/${r.ho}`) ?? null,
    suggestedStage: suggestStage(last.get(`${r.dong}/${r.ho}`)),
  }));
}

export async function parseDunningExcel(
  _prev: { rows?: PreparedRow[]; error?: string } | undefined,
  formData: FormData,
) {
  const session = await requireDunning();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { error: "파일을 선택해 주세요." };
  if (file.size > 5 * 1024 * 1024)
    return { error: "5MB 이하 파일만 업로드할 수 있습니다." };

  const XLSX = await import("xlsx");
  let raw: unknown[][];
  try {
    const wb = XLSX.read(await file.arrayBuffer());
    raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      header: 1,
      raw: false,
    });
  } catch {
    return { error: "파일을 읽을 수 없습니다. 엑셀(.xlsx) 파일인지 확인해 주세요." };
  }
  const { rows, error } = parseDunningRows(raw);
  if (error) return { error };
  return { rows: await prepareRows(session.tenantId!, rows) };
}

export async function prepareManualRows(rows: DunningRow[]) {
  const session = await requireDunning();
  return prepareRows(session.tenantId!, rows);
}

export async function createDunningBatch(payload: {
  rows: (DunningRow & { stage: DunningStage })[];
  dueDate: string; // "YYYY-MM-DD"
  account: string;
}) {
  // 문서·이력을 만드는 입구 — 화면 가드를 믿지 않고 여기서 다시 검사한다
  const session = await requireDunning();
  const tenantId = session.tenantId!;
  const rows = payload.rows.filter(
    (r) => r.dong && r.ho && r.amount > 0 && [1, 2, 3].includes(r.stage),
  );
  if (rows.length === 0) return { error: "발송할 세대가 없습니다." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.dueDate))
    return { error: "납부 기한을 선택해 주세요." };
  const account = payload.account.trim();
  if (!account) return { error: "납부 계좌를 입력해 주세요." };

  const now = new Date();
  // 제목은 동호수로 시작한다 — 목록·문서함에서 "몇 동 몇 호 건"으로 찾기 때문.
  // content에 세대 나열을 실어 문서함 검색(제목·내용·번호)이 동호·이름으로도 걸리게 한다.
  const first = `${rows[0].dong}동 ${rows[0].ho}호`;
  const unitList = rows.map((r) => `${r.dong}동 ${r.ho}호${r.name ? ` ${r.name}` : ""}`);
  const doc = await createDocument({
    tenantId,
    moduleId: "dunning",
    type: "dunning_letter",
    title: `미납 관리비 독촉 — ${first}${rows.length > 1 ? ` 외 ${rows.length - 1}세대` : ""}`,
    content:
      unitList.slice(0, 100).join(", ") +
      (unitList.length > 100 ? ` 외 ${unitList.length - 100}세대` : ""),
    status: "final", // 관리사무소장 명의 즉시 확정 — 공고문과 같은 취급
    createdById: session.userId,
    meta: { dueDate: payload.dueDate, account, sentDate: ymdKst(now) },
  });
  try {
    // 행별 루프 금지 — createMany 한 방 (AGENTS.md)
    await db.dunningEntry.createMany({
      data: rows.map((r) => ({
        tenantId,
        docId: doc.id,
        dong: r.dong,
        ho: r.ho,
        name: r.name,
        amount: r.amount,
        period: r.period,
        stage: r.stage,
      })),
    });
  } catch (e) {
    // 세대 없는 빈 회차를 문서함에 남기지 않는다
    await db.document.delete({ where: { id: doc.id } });
    throw e;
  }
  revalidatePath("/modules/dunning");
  redirect(`/modules/dunning/${doc.id}`);
}

/**
 * 납부 확인 일괄 저장 — 화면에서 체크한 상태(paidIds)를 그대로 반영한다.
 * 체크마다 바로 쓰는 방식은 "저장이 안 된 것 같다"는 불안을 만들어
 * [저장] 버튼이 있는 명시적 저장으로 바꿨다(사용자 피드백).
 */
export async function savePaidEntries(docId: string, paidIds: string[]) {
  const session = await requireDunning();
  const tenantId = session.tenantId!;
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId, type: "dunning_letter" }, // tenantId가 소유권 검사
    select: { id: true },
  });
  if (!doc) return { error: "문서를 찾을 수 없습니다." };
  await db.$transaction([
    db.dunningEntry.updateMany({
      where: { docId, tenantId, id: { in: paidIds }, paidAt: null },
      data: { paidAt: new Date() },
    }),
    db.dunningEntry.updateMany({
      // not: null = "값이 있는 행" — 체크 해제된 세대의 납부 표시를 되돌린다
      where: { docId, tenantId, id: { notIn: paidIds }, paidAt: { not: null } },
      data: { paidAt: null },
    }),
  ]);
  revalidatePath(`/modules/dunning/${docId}`);
  revalidatePath("/modules/dunning");
  return { ok: true };
}

/**
 * 회차 폐기 — 잘못 만든 회차의 유일한 정정 경로(문서는 수정 불가 확정본).
 * 하드 삭제가 아니라 status: void — 문서함에 "폐기"로 남고,
 * 단계 제안·홈 집계에서는 빠진다(entries 조회가 document.status: final만 본다).
 */
export async function voidDunningBatch(docId: string) {
  const session = await requireDunning();
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId: session.tenantId!, type: "dunning_letter" },
    select: { id: true, createdById: true },
  });
  if (!doc) return { error: "문서를 찾을 수 없습니다." };
  // 폐기는 작성자 본인 또는 마스터 — 문서 수정·폐기의 공통 경계
  if (doc.createdById !== session.userId && session.role !== Role.DIRECTOR)
    return { error: "폐기는 작성자 또는 마스터만 할 수 있습니다." };
  await db.document.updateMany({
    where: { id: docId, status: "final" },
    data: { status: "void" },
  });
  revalidatePath("/modules/dunning");
  redirect("/modules/dunning");
}
