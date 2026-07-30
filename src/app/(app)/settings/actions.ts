"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hashSync } from "bcryptjs";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { tempPassword, type TempPasswordResult } from "@/lib/temp-password";
import { normalizeEmail } from "@/lib/utils";
import { parseWon } from "@/lib/won";
import { Role } from "@/generated/prisma/enums";

const STAFF_ROLES: Role[] = [Role.DIRECTOR, Role.ACCOUNTANT, Role.STAFF];

/** 세대 엑셀 1회 업로드 상한 — 국내 최대 단지도 1만 세대를 넘지 않는다 */
const MAX_UNIT_ROWS = 20000;

/**
 * 이미지 입력칸 → data URI. 파일 스토리지가 없어 DB에 저장한다(직인·로고, 수십 KB급).
 * undefined = 변경 없음 / null = 삭제 체크박스
 */
async function imageField(formData: FormData, name: string, removeName: string) {
  if (formData.get(removeName) === "on") return null;
  const f = formData.get(name);
  if (!(f instanceof File) || f.size === 0) return undefined;
  if (!f.type.startsWith("image/"))
    throw new Error("이미지 파일만 업로드할 수 있습니다.");
  if (f.size > 1024 * 1024)
    throw new Error("이미지는 1MB 이하로 업로드해 주세요.");
  return `data:${f.type};base64,${Buffer.from(await f.arrayBuffer()).toString("base64")}`;
}

export async function updateTenantInfo(formData: FormData) {
  const session = await requireRole(Role.DIRECTOR);
  const households = Number(formData.get("households"));

  const sealImage = await imageField(formData, "sealImage", "removeSeal");
  const logoImage = await imageField(formData, "logoImage", "removeLogo");

  await db.tenant.update({
    where: { id: session.tenantId! },
    data: {
      name: String(formData.get("name") ?? "").trim() || undefined,
      address: String(formData.get("address") ?? "").trim() || null,
      phone: String(formData.get("phone") ?? "").trim() || null,
      fax: String(formData.get("fax") ?? "").trim() || null,
      buildingInfo: String(formData.get("buildingInfo") ?? "").trim() || null,
      households: Number.isFinite(households) && households > 0 ? households : null,
      sealImage,
      logoImage,
    },
  });
  revalidatePath("/settings");
  // 저장했다는 신호 — SavedToast가 토스트를 띄우고 주소를 되돌린다
  redirect("/settings?saved=1");
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

/** 마스터가 직원 비밀번호 재설정 — 운영자까지 안 가고 단지 안에서 해결 */
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

  // 외부 결재자 — 직원이 아니라 계정 없이 이름·연락처만 저장. 회장·감사는 고정 역할
  // (지출 품의 +회장, 장충금 공사 +감사+회장 자동 추가), 그 외 위원은 ETC + 역할명.
  // 동적 목록이라 hidden input의 JSON 하나로 받는다.
  let raw: unknown = [];
  try {
    raw = JSON.parse(String(formData.get("externalApprovers") ?? "[]"));
  } catch {
    /* 깨진 입력은 빈 목록 취급 */
  }
  const seen = new Set<string>();
  /*
   * 상시 열람 링크 토큰 — 이미 있으면 그대로 둔다(전달해 둔 링크가 살아 있어야 한다).
   * 빈 값으로 오면 새로 발급되므로 화면의 "새로 발급"은 이 칸을 비우기만 하면 된다.
   *
   * 판정은 **생성기와 같은 기준**으로 한다(내 단지 접두어 + 64자리 hex 길이).
   * 문자셋 정규식으로 검사하면 cuid 형식이 바뀌는 날 멀쩡한 토큰이 전부 재발급돼
   * 나가 있는 링크가 한꺼번에 죽는다. 접두어를 보므로 남의 단지 토큰도 못 붙여넣는다.
   */
  const prefix = `${session.tenantId}.`;
  const inboxToken = (v: unknown) =>
    typeof v === "string" &&
    v.startsWith(prefix) &&
    v.length === prefix.length + 64
      ? v
      : prefix + crypto.randomBytes(32).toString("hex");
  const externalApprovers = (Array.isArray(raw) ? raw : [])
    .slice(0, 10)
    .map((e: Record<string, unknown>) => ({
      role:
        e.role === "CHAIR" || e.role === "AUDITOR" ? (e.role as string) : "ETC",
      label: String(e.label ?? "").trim().slice(0, 20) || undefined,
      name: String(e.name ?? "").trim().slice(0, 30),
      phone: String(e.phone ?? "").trim().slice(0, 20) || undefined,
      email: String(e.email ?? "").trim().slice(0, 100) || undefined,
      token: inboxToken(e.token),
    }))
    .filter((e) => e.name)
    // 회장·감사는 각 1명 — 중복 제출이 와도 첫 항목만 남긴다
    .filter((e) => {
      if (e.role === "ETC") return true;
      if (seen.has(e.role)) return false;
      seen.add(e.role);
      return true;
    });

  await db.tenant.update({
    where: { id: session.tenantId! },
    data: { approvalLine: line, externalApprovers },
  });
  revalidatePath("/settings/approval-line");
  redirect("/settings/approval-line?saved=1");
}

/**
 * 전결 규정 — 결재선과 같은 판단(이 문서가 누구에게 가느냐)이지만 화면을 나눴다.
 * 결재선 카드 아래에 붙어 있으니 안 보인다는 지적이 있었다.
 *
 * ⚠️ 저장도 반드시 따로다. 한 액션이 둘 다 쓰면, 전결 입력칸이 없는 결재선 화면에서
 * 저장할 때마다 폼에 없는 전결 한도가 null로 덮여 조용히 지워진다.
 */
export async function saveDirectorLimit(formData: FormData) {
  const session = await requireRole(Role.DIRECTOR);
  // 0이나 빈 칸은 "한도 없음"(null)으로 — 0원 한도는 모든 지출이 전결이라는 뜻이 되어 위험하다
  const limit = parseWon(formData.get("directorLimit"));

  await db.tenant.update({
    where: { id: session.tenantId! },
    data: {
      directorLimit: limit > 0 ? limit : null,
      directorLimitClause:
        String(formData.get("directorLimitClause") ?? "")
          .trim()
          .slice(0, 100) || null,
    },
  });
  revalidatePath("/settings/director-limit");
  redirect("/settings/director-limit?saved=1");
}

export async function uploadUnits(
  _prev: { error?: string; success?: string } | undefined,
  formData: FormData,
) {
  // 세대 명부는 부과·수납 실무자의 일이다 — 매니저도 올릴 수 있다
  const session = await requireRole(Role.DIRECTOR, Role.ACCOUNTANT);
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
      // 체험이 끝난 모듈은 카드가 있어야 다시 켤 수 있다. 이 가드가 없으면
      // 만료 잠금을 구독 토글 한 번으로 우회해 무료로 계속 쓰게 된다.
      const billing = await db.billing.findUnique({ where: { tenantId } });
      if (
        existing.trialEndsAt &&
        existing.trialEndsAt <= new Date() &&
        !billing?.billingKey
      )
        throw new Error(
          "무료 체험이 종료된 모듈입니다. 설정 > 결제에서 카드를 등록해 주세요.",
        );
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
