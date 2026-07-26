"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSession, requireRole, requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { Role, TenantStatus } from "@/generated/prisma/enums";

export async function toggleTenantModule(formData: FormData) {
  await requireRole(Role.SUPER_ADMIN);
  const tenantId = String(formData.get("tenantId"));
  const moduleId = String(formData.get("moduleId"));
  const subscribe = formData.get("subscribe") === "true";
  await db.tenantModule.upsert({
    where: { tenantId_moduleId: { tenantId, moduleId } },
    update: { status: subscribe ? "ACTIVE" : "CANCELED" },
    create: { tenantId, moduleId },
  });
  revalidatePath(`/admin/tenants/${tenantId}`);
}

export async function setTenantStatus(formData: FormData) {
  await requireRole(Role.SUPER_ADMIN);
  const tenantId = String(formData.get("tenantId"));
  const status = String(formData.get("status")) as TenantStatus;
  if (!Object.values(TenantStatus).includes(status))
    throw new Error("잘못된 상태입니다.");
  await db.tenant.update({ where: { id: tenantId }, data: { status } });
  revalidatePath(`/admin/tenants/${tenantId}`);
  revalidatePath("/admin/tenants");
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
    route: String(formData.get("route") ?? "").trim() || `/modules/${id}`,
    price: Math.max(0, Number(formData.get("price")) || 0),
    sortOrder: Number(formData.get("sortOrder")) || 0,
    isActive: formData.get("isActive") === "on",
  };
  if (!data.name) throw new Error("모듈 이름을 입력해 주세요.");
  await db.module.upsert({ where: { id }, update: data, create: { id, ...data } });
  revalidatePath("/admin/modules");
  redirect("/admin/modules");
}

export async function postAnnouncement(formData: FormData) {
  await requireRole(Role.SUPER_ADMIN);
  const message = String(formData.get("message") ?? "").trim();
  if (!message) return;
  await db.announcement.updateMany({ data: { active: false } }); // 배너는 한 번에 하나만
  await db.announcement.create({ data: { message } });
  revalidatePath("/admin/announcements");
}

export async function toggleAnnouncement(formData: FormData) {
  await requireRole(Role.SUPER_ADMIN);
  const id = String(formData.get("id"));
  const active = formData.get("active") === "true";
  if (active) await db.announcement.updateMany({ data: { active: false } });
  await db.announcement.update({ where: { id }, data: { active } });
  revalidatePath("/admin/announcements");
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
  redirect("/");
}

export async function stopImpersonation() {
  const session = await requireSession();
  if (!session.impersonating) redirect("/");
  await createSession({
    userId: session.userId,
    tenantId: null,
    role: Role.SUPER_ADMIN,
    name: session.name,
  });
  redirect("/admin");
}
