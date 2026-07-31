"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { createDocument } from "@/lib/documents";
import {
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
      where: { tenantId, OR: or },
      orderBy: { createdAt: "desc" },
      select: { dong: true, ho: true, stage: true, paidAt: true },
    }),
  ]);
  const nameOf = new Map(units.map((u) => [`${u.dong}/${u.ho}`, u.name]));
  // (동,호)별 최신 발송 하나 — desc 정렬이라 처음 만난 것이 최신
  const last = new Map<string, { stage: number; paidAt: Date | null }>();
  for (const e of entries) {
    const k = `${e.dong}/${e.ho}`;
    if (!last.has(k)) last.set(k, e);
  }
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
  const doc = await createDocument({
    tenantId,
    moduleId: "dunning",
    type: "dunning_letter",
    title: `미납 관리비 독촉 — ${now.getFullYear()}년 ${now.getMonth() + 1}월 (${rows.length}세대)`,
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

export async function toggleEntryPaid(formData: FormData) {
  const session = await requireDunning();
  const id = String(formData.get("id"));
  const entry = await db.dunningEntry.findFirst({
    where: { id, tenantId: session.tenantId! }, // tenantId가 소유권 검사
  });
  if (!entry) return;
  await db.dunningEntry.update({
    where: { id },
    data: { paidAt: entry.paidAt ? null : new Date() },
  });
  revalidatePath(`/modules/dunning/${entry.docId}`);
  revalidatePath("/modules/dunning");
}
