"use server";

import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hashSync } from "bcryptjs";
import { logAccess } from "@/lib/access-log";
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
  // SVG 제외 — 스크립트를 실을 수 있는 형식은 받지 않는다(attachments.ts와 같은 기준)
  if (!f.type.startsWith("image/") || f.type === "image/svg+xml")
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
      zipcode: String(formData.get("zipcode") ?? "").trim().slice(0, 10) || null,
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
    return { error: "본인 비밀번호는 내 계정(왼쪽 아래 프로필)에서 변경해 주세요." };
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
      dong: String(e.dong ?? "").trim().slice(0, 10) || undefined,
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
    // 병합도 벌크로 — 세대별 upsert를 순차로 돌리면 수천 세대에서 트랜잭션
    // 타임아웃(기본 5초)이 나 "2만 세대까지"라는 안내가 거짓말이 된다.
    // 올라온 (동,호)만 지우고 다시 넣으면 결과는 upsert와 같고 왕복은 두 번이다.
    // Unit을 참조하는 FK가 없어 id가 새로 발급돼도 깨질 곳이 없다.
    await tx.unit.deleteMany({
      where: {
        tenantId: session.tenantId!,
        OR: unique.map((u) => ({ dong: u.dong, ho: u.ho })),
      },
    });
    await tx.unit.createMany({ data: unique });
  });
  // 접속기록 — 세대주 성명·연락처(개인정보)의 대량 반입이다
  await logAccess("units_upload", {
    tenantId: session.tenantId,
    userId: session.userId,
    detail: `${unique.length}세대${replace ? " (전체 교체)" : ""}`,
  });
  revalidatePath("/settings/units");
  return { success: `${unique.length}세대를 등록했습니다.` };
}

// 구독 토글(setSubscription)은 구독 화면 옆으로 옮겼다 — (billing)/subscriptions/actions.ts
