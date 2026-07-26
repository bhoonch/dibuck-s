"use server";

import { revalidatePath } from "next/cache";
import { hashSync } from "bcryptjs";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { tempPassword, type TempPasswordResult } from "@/lib/temp-password";
import { Role } from "@/generated/prisma/enums";

const STAFF_ROLES: Role[] = [Role.DIRECTOR, Role.ACCOUNTANT, Role.STAFF];

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
  const email = String(formData.get("email") ?? "").trim();
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
  await db.user.delete({ where: { id: userId } }); // 알림은 cascade, 문서 작성자는 null 처리
  revalidatePath("/settings/staff");
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
    data: { passwordHash: hashSync(password, 10) },
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
  const units = rows
    .filter((r) => Array.isArray(r) && cell(r, 0) && cell(r, 1))
    .filter((r) => !cell(r, 0).includes("동") || /\d/.test(cell(r, 0))) // 헤더 행 제외
    .map((r) => ({
      tenantId: session.tenantId!,
      dong: cell(r, 0).replace(/동$/, ""),
      ho: cell(r, 1).replace(/호$/, ""),
      name: cell(r, 2) || null,
      phone: cell(r, 3) || null,
    }));
  if (units.length === 0)
    return { error: "등록할 세대가 없습니다. A열=동, B열=호 형식인지 확인해 주세요." };

  if (formData.get("replace") === "on")
    await db.unit.deleteMany({ where: { tenantId: session.tenantId! } });
  let saved = 0;
  for (const u of units) {
    await db.unit.upsert({
      where: {
        tenantId_dong_ho: { tenantId: u.tenantId, dong: u.dong, ho: u.ho },
      },
      update: { name: u.name, phone: u.phone },
      create: u,
    });
    saved++;
  }
  revalidatePath("/settings/units");
  return { success: `${saved}세대를 등록했습니다.` };
}

export async function setSubscription(moduleId: string, subscribe: boolean) {
  const session = await requireRole(Role.DIRECTOR);
  const tenantId = session.tenantId!;
  const where = { tenantId_moduleId: { tenantId, moduleId } };

  if (!subscribe) {
    await db.tenantModule.update({ where, data: { status: "CANCELED" } });
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
      // 체험 표준 기간은 모듈 관리에서 설정 — 전 단지 동일 적용, 0이면 체험 없이 시작
      const mod = await db.module.findUniqueOrThrow({ where: { id: moduleId } });
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
