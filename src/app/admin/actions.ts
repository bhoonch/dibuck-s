"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { hashSync } from "bcryptjs";
import { createSession, requireRole, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  announcementTargets,
  targetNeedsModule,
  targetNeedsTenants,
} from "@/lib/announcements";
import { parseWon } from "@/lib/won";
import { kstDayEnd, kstDayStart, normalizeEmail, ymdKst } from "@/lib/utils";
import { logAdmin } from "@/lib/admin-log";
import { logAccess } from "@/lib/access-log";
import { roleLabels } from "@/lib/labels";
import { notifyTenant } from "@/lib/notifications";
import { tempPassword, type TempPasswordResult } from "@/lib/temp-password";
import { Role, TenantStatus } from "@/generated/prisma/enums";

export async function toggleTenantModule(formData: FormData) {
  await requireRole(Role.SUPER_ADMIN);
  const tenantId = String(formData.get("tenantId"));
  const moduleId = String(formData.get("moduleId"));
  const subscribe = formData.get("subscribe") === "true";
  await db.tenantModule.upsert({
    where: { tenantId_moduleId: { tenantId, moduleId } },
    // 체험 기한은 "정식 구독으로 켜는" 경로에서만 지운다.
    // 해지에서도 지우면 만료 잠금이 풀려 무료 정식 구독이 되고, 지난 체험 기간이
    // 소급해서 유료 매출(wasPaidAt)로 잡힌다.
    update: subscribe
      ? { status: "ACTIVE", trialEndsAt: null }
      : { status: "CANCELED" },
    create: { tenantId, moduleId, status: subscribe ? "ACTIVE" : "CANCELED" },
  });
  await logAdmin("module_toggle", {
    tenantId,
    detail: `${moduleId} ${subscribe ? "구독" : "해지"}`,
  });
  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath("/admin/revenue");
}

/** 무료 체험 시작·기간 변경 / 유료 전환 (체험 단위는 모듈별, 기간은 운영자 지정) */
export async function setModuleTrial(formData: FormData) {
  await requireRole(Role.SUPER_ADMIN);
  const tenantId = String(formData.get("tenantId"));
  const moduleId = String(formData.get("moduleId"));
  const trial = formData.get("trial") === "true";
  let trialEndsAt: Date | null = null;
  if (trial) {
    const mod = await db.module.findUniqueOrThrow({ where: { id: moduleId } });
    const days = Math.min(
      365,
      Math.max(1, Math.round(Number(formData.get("days"))) || mod.trialDays || 30),
    );
    trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + days);
  }
  // 변경 전 값을 로그에 남긴다 — 잘못 바꿨을 때 되돌릴 근거가 로그뿐이다
  const prev = await db.tenantModule.findUnique({
    where: { tenantId_moduleId: { tenantId, moduleId } },
    select: { trialEndsAt: true },
  });
  await db.tenantModule.upsert({
    where: { tenantId_moduleId: { tenantId, moduleId } },
    update: { status: "ACTIVE", trialEndsAt },
    create: { tenantId, moduleId, trialEndsAt },
  });
  const label = (d: Date | null) => (d ? `체험 ~${ymdKst(d)}` : "유료");
  await logAdmin("module_trial", {
    tenantId,
    detail: `${moduleId} ${prev ? label(prev.trialEndsAt) : "신규"} → ${label(trialEndsAt)}`,
  });
  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath("/admin/revenue");
}

export async function setTenantStatus(formData: FormData) {
  await requireRole(Role.SUPER_ADMIN);
  const tenantId = String(formData.get("tenantId"));
  const status = String(formData.get("status")) as TenantStatus;
  if (!Object.values(TenantStatus).includes(status))
    throw new Error("잘못된 상태입니다.");
  const tenant = await db.tenant.update({
    where: { id: tenantId },
    data: { status },
  });
  await logAdmin("tenant_status", {
    tenantId,
    tenantName: tenant.name,
    detail: status === "SUSPENDED" ? "이용 중지" : "이용 재개",
  });
  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath("/admin/tenants");
}

export async function createTenant(formData: FormData) {
  await requireRole(Role.SUPER_ADMIN);
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("단지명을 입력해 주세요.");
  const households = Number(formData.get("households"));
  const tenant = await db.tenant.create({
    data: {
      name,
      address: String(formData.get("address") ?? "").trim() || null,
      buildingInfo: String(formData.get("buildingInfo") ?? "").trim() || null,
      households: Number.isFinite(households) && households > 0 ? households : null,
    },
  });
  revalidatePath("/admin/tenants");
  redirect(`/admin/tenants/${tenant.id}`);
}

const STAFF_ROLES: Role[] = [Role.DIRECTOR, Role.ACCOUNTANT, Role.STAFF];

export type StaffActionState = TempPasswordResult;

/** 관리자가 단지에 직원 계정 발급 — 임시 비밀번호를 만들어 화면에 한 번 보여준다 */
export async function adminAddStaff(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  await requireRole(Role.SUPER_ADMIN);
  const tenantId = String(formData.get("tenantId"));
  const email = normalizeEmail(formData.get("email"));
  const name = String(formData.get("name") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim() || null;
  const role = String(formData.get("role")) as Role;

  if (!email || !name) return { error: "이름과 이메일을 입력해 주세요." };
  if (!STAFF_ROLES.includes(role)) return { error: "잘못된 권한입니다." };
  if (await db.user.findUnique({ where: { email } }))
    return { error: "이미 사용 중인 이메일입니다." };
  await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });

  const password = tempPassword();
  await db.user.create({
    data: { tenantId, email, name, title, role, passwordHash: hashSync(password, 10) },
  });
  await logAdmin("staff_add", {
    tenantId,
    detail: `${name} (${email}) · ${roleLabels[role]} 권한`,
  });
  revalidatePath(`/admin/tenants/${tenantId}`);
  return { tempPassword: password, email, name };
}

/** 관리자가 직원 비밀번호 재설정 — 기존 비밀번호는 즉시 무효화된다 */
export async function adminResetPassword(
  _prev: StaffActionState,
  formData: FormData,
): Promise<StaffActionState> {
  await requireRole(Role.SUPER_ADMIN);
  const userId = String(formData.get("userId"));
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !user.tenantId)
    return { error: "단지 소속 직원만 재설정할 수 있습니다." };

  const password = tempPassword();
  await db.user.update({
    where: { id: userId },
    // passwordChangedAt 갱신 = 기존 세션이 즉시 끊긴다 (재설정의 원래 의도)
    data: { passwordHash: hashSync(password, 10), passwordChangedAt: new Date() },
  });
  await logAdmin("password_reset", {
    tenantId: user.tenantId,
    detail: `${user.name} (${user.email})`,
  });
  return { tempPassword: password, email: user.email, name: user.name };
}

export async function saveTenantMemo(formData: FormData) {
  await requireRole(Role.SUPER_ADMIN);
  const tenantId = String(formData.get("tenantId"));
  const memo = String(formData.get("memo") ?? "").trim() || null;
  await db.tenant.update({ where: { id: tenantId }, data: { memo } });
  revalidatePath(`/admin/tenants/${tenantId}`);
}

export async function saveModule(formData: FormData) {
  await requireRole(Role.SUPER_ADMIN);
  const id = String(formData.get("id") ?? "").trim();
  if (!/^[a-z][a-z0-9-]*$/.test(id))
    throw new Error("모듈 ID는 영문 소문자 slug여야 합니다.");
  const data = {
    name: String(formData.get("name") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
    icon: String(formData.get("icon") ?? "").trim() || "LayoutGrid",
    // 라우트는 항상 모듈 ID에서 파생 — 입력받을 이유가 없다
    route: `/modules/${id}`,
    price: parseWon(formData.get("price")),
    trialDays: parseTrialDays(formData.get("trialDays")),
    sortOrder: Number(formData.get("sortOrder")) || 0,
    isActive: formData.get("isActive") === "on",
  };
  if (!data.name) throw new Error("모듈 이름을 입력해 주세요.");
  await db.module.upsert({ where: { id }, update: data, create: { id, ...data } });
  revalidatePath("/admin/modules");
  redirect("/admin/modules");
}

/** 체험 기간 입력(일) — 0이면 체험 없이 바로 유료 */
const parseTrialDays = (v: FormDataEntryValue | null) =>
  Math.min(365, Math.max(0, Math.round(Number(v)) || 0));

/** 모듈 관리 화면의 인라인 가격·체험 기간 수정 (전 단지 동일 적용) */
export async function saveModulePrice(formData: FormData) {
  await requireRole(Role.SUPER_ADMIN);
  const id = String(formData.get("id"));
  const price = parseWon(formData.get("price"));
  const trialDays = parseTrialDays(formData.get("trialDays"));
  await db.module.update({ where: { id }, data: { price, trialDays } });
  revalidatePath("/admin/modules");
  revalidatePath("/admin/revenue");
}

export async function postAnnouncement(formData: FormData) {
  await requireRole(Role.SUPER_ADMIN);
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return;

  const target = String(formData.get("target") ?? "ALL");
  if (!(target in announcementTargets)) throw new Error("잘못된 대상입니다.");

  // 대상이 값을 요구하면 반드시 받는다 — 값 없는 MODULE 공지는 아무에게도 안 보인다
  let targetValue: string | null = null;
  if (targetNeedsModule(target)) {
    targetValue = String(formData.get("moduleId") ?? "").trim();
    if (!targetValue) throw new Error("대상 모듈을 선택해 주세요.");
  } else if (targetNeedsTenants(target)) {
    targetValue = formData
      .getAll("tenantIds")
      .map((v) => String(v).trim())
      .filter(Boolean)
      .join(",");
    if (!targetValue) throw new Error("대상 단지를 한 곳 이상 선택해 주세요.");
  }

  // 운영자가 고른 날짜는 KST 기준이다. new Date("2026-07-27")은 UTC 자정 = KST 09시라
  // 시작일은 오전 9시까지 "예약"으로 보이고 종료일은 당일 오전 9시에 공지가 사라진다.
  const parseDate = (key: string, edge: (v: string) => Date) => {
    const raw = String(formData.get(key) ?? "").trim();
    if (!raw) return null;
    const d = edge(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const startsAt = parseDate("startsAt", kstDayStart) ?? new Date();
  const endsAt = parseDate("endsAt", kstDayEnd);
  if (endsAt && endsAt < startsAt)
    throw new Error("게시 종료일이 시작일보다 빠릅니다.");
  // 링크는 앱 안(/billing 등)만 허용한다 — 외부 주소를 그대로 넣게 두면
  // 공지 배너가 피싱 링크를 우리 이름으로 실어 나르는 통로가 된다
  const rawLink = String(formData.get("linkUrl") ?? "").trim();
  const linkUrl = rawLink.startsWith("/") && !rawLink.startsWith("//") ? rawLink : null;
  const linkLabel = linkUrl
    ? String(formData.get("linkLabel") ?? "").trim() || null
    : null;

  await db.announcement.create({
    data: { message, target, targetValue, startsAt, endsAt, linkUrl, linkLabel },
  });
  revalidatePath("/admin/announcements");
  revalidatePath("/", "layout");
  redirect("/admin/announcements");
}

export async function toggleAnnouncement(formData: FormData) {
  await requireRole(Role.SUPER_ADMIN);
  const id = String(formData.get("id"));
  const active = formData.get("active") === "true";
  await db.announcement.update({ where: { id }, data: { active } });
  revalidatePath("/admin/announcements");
  revalidatePath("/", "layout");
}

/**
 * 문의 답변 저장 — 답변 본문을 앱 안에 남기고 접수자에게 알림을 보낸다.
 * 전화·이메일로 답하던 걸 대체한다: 사용자는 종 아이콘 → 클릭 두 번이면 답변에 닿는다.
 */
export async function answerInquiry(formData: FormData) {
  await requireRole(Role.SUPER_ADMIN);
  const id = String(formData.get("id"));
  const answer = String(formData.get("answer") ?? "").trim();
  if (!answer) throw new Error("답변 내용을 입력해 주세요.");

  const inquiry = await db.inquiry.update({
    where: { id },
    data: { answer: answer.slice(0, 2000), answeredAt: new Date(), status: "answered" },
  });

  // 가입 전 "체험 신청" 접수분은 단지가 없어 알릴 대상도 없다
  if (inquiry.tenantId)
    await notifyTenant({
      tenantId: inquiry.tenantId,
      type: "inquiry_answered",
      title: "문의에 답변이 등록되었습니다",
      body: inquiry.title.slice(0, 80),
      link: "/support",
    });

  revalidatePath("/admin/support");
  revalidatePath("/admin", "layout");
}

export async function setInquiryStatus(formData: FormData) {
  await requireRole(Role.SUPER_ADMIN);
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!["open", "answered"].includes(status))
    throw new Error("잘못된 상태입니다.");
  await db.inquiry.update({ where: { id }, data: { status } });
  revalidatePath("/admin/support");
  revalidatePath("/admin", "layout");
}

/** 단지 사용자 화면으로 전환 — 관리자 신원(userId)은 유지한 채 세션만 바꾼다 */
export async function impersonate(formData: FormData) {
  const session = await requireRole(Role.SUPER_ADMIN);
  const tenantId = String(formData.get("tenantId"));
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  await createSession({
    userId: session.userId,
    tenantId: tenant.id,
    role: Role.DIRECTOR,
    name: session.name,
    impersonating: true,
  });
  await logAdmin("impersonate", { tenantId: tenant.id, tenantName: tenant.name });
  // 접속기록에도 병기 — 단지 개인정보에 대한 운영자 접근이라 두 로그의 성격이 다르다
  await logAccess("impersonate", { tenantId: tenant.id, userId: session.userId });
  redirect("/home");
}

export async function stopImpersonation() {
  const session = await requireSession();
  if (!session.impersonating) redirect("/home");
  await logAdmin("impersonate_stop", { tenantId: session.tenantId ?? undefined });
  await createSession({
    userId: session.userId,
    tenantId: null,
    role: Role.SUPER_ADMIN,
    name: session.name,
  });
  redirect("/admin");
}
