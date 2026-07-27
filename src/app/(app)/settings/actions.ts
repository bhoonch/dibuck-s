"use server";

import { revalidatePath } from "next/cache";
import { hashSync } from "bcryptjs";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { tempPassword, type TempPasswordResult } from "@/lib/temp-password";
import { normalizeEmail } from "@/lib/utils";
import { Role } from "@/generated/prisma/enums";

const STAFF_ROLES: Role[] = [Role.DIRECTOR, Role.ACCOUNTANT, Role.STAFF];

/** 세대 엑셀 1회 업로드 상한 — 국내 최대 단지도 1만 세대를 넘지 않는다 */
const MAX_UNIT_ROWS = 20000;

export async function updateTenantInfo(formData: FormData) {
  const session = await requireRole(Role.DIRECTOR);
  const households = Number(formData.get("households"));
  await db.tenant.update({
    where: { id: session.tenantId! },
    data: {
      name: String(formData.get("name") ?? "").trim() || undefined,
      address: String(formData.get("address") ?? "").trim() || null,
      buildingInfo: String(formData.get("buildingInfo") ?? "").trim() || null,
      households: Number.isFinite(households) && households > 0 ? households : null,
    },
  });
  revalidatePath("/settings");
}

export async function addStaff(
  _prev: { error?: string; success?: boolean } | undefined,
  formData: FormData,
) {
  const session = await requireRole(Role.DIRECTOR);
  const email = normalizeEmail(formData.get("email"));
  const name = String(formData.get("name") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim() || null;
  const role = String(formData.get("role")) as Role;
  const password = String(formData.get("password") ?? "");

  if (!email || !name || !password)
    return { error: "모든 항목을 입력해 주세요." };
  if (password.length < 8)
    return { error: "비밀번호는 8자 이상이어야 합니다." };
  if (!STAFF_ROLES.includes(role)) return { error: "잘못된 역할입니다." };
  if (await db.user.findUnique({ where: { email } }))
    return { error: "이미 사용 중인 이메일입니다." };

  await db.user.create({
    data: {
      email,
      name,
      title,
      role,
      tenantId: session.tenantId!,
      passwordHash: hashSync(password, 10),
    },
  });
  revalidatePath("/settings/staff");
  return { success: true };
}

export async function updateStaffRole(userId: string, role: Role) {
  const session = await requireRole(Role.DIRECTOR);
  if (userId === session.userId)
    throw new Error("본인 계정의 역할은 변경할 수 없습니다.");
  if (!STAFF_ROLES.includes(role)) throw new Error("잘못된 역할입니다.");
  const target = await db.user.findUnique({ where: { id: userId } });
  if (target?.tenantId !== session.tenantId)
    throw new Error("다른 단지의 직원입니다.");
  await db.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/settings/staff");
}

export async function removeStaff(userId: string) {
  const session = await requireRole(Role.DIRECTOR);
  if (userId === session.userId)
    throw new Error("본인 계정은 삭제할 수 없습니다.");
  const target = await db.user.findUnique({ where: { id: userId } });
  if (target?.tenantId !== session.tenantId)
    throw new Error("다른 단지의 직원입니다.");
  await db.$transaction(async (tx) => {
    await tx.user.delete({ where: { id: userId } }); // 알림은 cascade, 문서 작성자는 null 처리
    // 결재선에 남으면 없는 사람에게 결재가 걸린다 — 같은 트랜잭션에서 빼낸다
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: session.tenantId! },
      select: { approvalLine: true },
    });
    const line = Array.isArray(tenant.approvalLine) ? tenant.approvalLine : [];
    if (line.includes(userId))
      await tx.tenant.update({
        where: { id: session.tenantId! },
        data: { approvalLine: line.filter((id) => id !== userId) },
      });
  });
  revalidatePath("/settings/staff");
  revalidatePath("/settings/approval-line");
}

/** 소장이 직원 비밀번호 재설정 — 운영자까지 안 가고 단지 안에서 해결 */
export async function directorResetStaffPassword(
  _prev: TempPasswordResult,
  formData: FormData,
): Promise<TempPasswordResult> {
  const session = await requireRole(Role.DIRECTOR);
  const userId = String(formData.get("userId"));
  if (userId === session.userId)
    return { error: "본인 비밀번호는 설정 > 내 계정에서 변경해 주세요." };
  const target = await db.user.findUnique({ where: { id: userId } });
  if (target?.tenantId !== session.tenantId)
    return { error: "다른 단지의 직원입니다." };

  const password = tempPassword();
  await db.user.update({
    where: { id: userId },
    // passwordChangedAt 갱신 = 그 직원의 기존 세션이 즉시 끊긴다
    data: { passwordHash: hashSync(password, 10), passwordChangedAt: new Date() },
  });
  return { tempPassword: password, email: target.email, name: target.name };
}

export async function saveApprovalLine(formData: FormData) {
  const session = await requireRole(Role.DIRECTOR);
  const ids = ["approver1", "approver2", "approver3"]
    .map((k) => String(formData.get(k) ?? ""))
    .filter(Boolean);
  const line = [...new Set(ids)]; // 중복 결재자 제거
  const valid = await db.user.count({
    where: { id: { in: line }, tenantId: session.tenantId },
  });
  if (valid !== line.length) throw new Error("잘못된 결재자입니다.");
  await db.tenant.update({
    where: { id: session.tenantId! },
    data: { approvalLine: line },
  });
  revalidatePath("/settings/approval-line");
}

export async function uploadUnits(
  _prev: { error?: string; success?: string } | undefined,
  formData: FormData,
) {
  const session = await requireRole(Role.DIRECTOR);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { error: "파일을 선택해 주세요." };
  if (file.size > 5 * 1024 * 1024)
    return { error: "5MB 이하 파일만 업로드할 수 있습니다." };

  const XLSX = await import("xlsx");
  let rows: unknown[][];
  try {
    const wb = XLSX.read(await file.arrayBuffer());
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      header: 1,
      raw: false,
    });
  } catch {
    return { error: "파일을 읽을 수 없습니다. 엑셀(.xlsx) 파일인지 확인해 주세요." };
  }

  const cell = (r: unknown[], i: number) => String(r[i] ?? "").trim();
  // 헤더 행만 걸러낸다 — "동"으로 끝나는 머리글("동", "동 번호")은 버리고
  // 실제 동 이름("101동", "가동")은 살린다
  const isHeader = (v: string) => v === "동" || /^동\s*\S*$/.test(v);
  const units = rows
    .filter((r) => Array.isArray(r) && cell(r, 0) && cell(r, 1))
    .filter((r) => !isHeader(cell(r, 0)))
    .map((r) => ({
      tenantId: session.tenantId!,
      dong: cell(r, 0).replace(/동$/, ""),
      ho: cell(r, 1).replace(/호$/, ""),
      name: cell(r, 2) || null,
      phone: cell(r, 3) || null,
    }));
  if (units.length === 0)
    return { error: "등록할 세대가 없습니다. A열=동, B열=호 형식인지 확인해 주세요." };
  if (units.length > MAX_UNIT_ROWS)
    return {
      error: `한 번에 ${MAX_UNIT_ROWS.toLocaleString()}세대까지 등록할 수 있습니다. 파일을 나눠 올려 주세요.`,
    };

  // 같은 파일 안의 중복 (동,호)는 뒤엣것만 남긴다 — createMany가 유니크 제약에 걸린다
  const unique = [...new Map(units.map((u) => [`${u.dong}/${u.ho}`, u])).values()];

  // 전체 삭제 후 재삽입은 반드시 한 트랜잭션 — 중간에 실패하면 세대 마스터가 통째로 날아간다
  const replace = formData.get("replace") === "on";
  await db.$transaction(async (tx) => {
    if (replace) {
      await tx.unit.deleteMany({ where: { tenantId: session.tenantId! } });
      await tx.unit.createMany({ data: unique });
      return;
    }
    for (const u of unique) {
      await tx.unit.upsert({
        where: {
          tenantId_dong_ho: { tenantId: u.tenantId, dong: u.dong, ho: u.ho },
        },
        update: { name: u.name, phone: u.phone },
        create: u,
      });
    }
  });
  revalidatePath("/settings/units");
  return { success: `${unique.length}세대를 등록했습니다.` };
}

export async function setSubscription(moduleId: string, subscribe: boolean) {
  const session = await requireRole(Role.DIRECTOR);
  const tenantId = session.tenantId!;
  const where = { tenantId_moduleId: { tenantId, moduleId } };

  if (!subscribe) {
    // 없는 구독을 해지해도 P2025 500이 나지 않게 — 중복 제출·오래된 탭에서 들어온다
    await db.tenantModule.updateMany({
      where: { tenantId, moduleId },
      data: { status: "CANCELED" },
    });
  } else {
    const existing = await db.tenantModule.findUnique({ where });
    if (existing) {
      // 체험이 끝난 모듈은 셀프 재활성화 불가 — 결제(PG) 연동 전까지는 유료 전환 문의로.
      // 이 가드가 없으면 만료 잠금을 구독 토글 한 번으로 우회한다.
      if (existing.trialEndsAt && existing.trialEndsAt <= new Date())
        throw new Error("무료 체험이 종료된 모듈입니다. 유료 전환을 문의해 주세요.");
      // 재구독 — 체험은 모듈당 최초 1회뿐, 남은 체험 기간이 있으면 그대로 이어진다
      await db.tenantModule.update({ where, data: { status: "ACTIVE" } });
    } else {
      // 체험 표준 기간은 모듈 관리에서 설정 — 전 단지 동일 적용, 0이면 체험 없이 시작.
      // isActive 검사는 목록 필터가 아니라 여기 있어야 한다 — 서버 액션은 직접 호출 가능이라
      // 판매 중단한 모듈 id를 넣으면 새 체험까지 받아 갈 수 있다
      const mod = await db.module.findUnique({
        where: { id: moduleId, isActive: true },
      });
      if (!mod) throw new Error("구독할 수 없는 모듈입니다.");
      let trialEndsAt: Date | null = null;
      if (mod.trialDays > 0) {
        trialEndsAt = new Date();
        trialEndsAt.setDate(trialEndsAt.getDate() + mod.trialDays);
      }
      await db.tenantModule.create({ data: { tenantId, moduleId, trialEndsAt } });
    }
  }
  revalidatePath("/", "layout"); // 사이드바·홈·설정 모두 갱신
}
