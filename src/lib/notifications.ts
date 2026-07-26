import { db } from "@/lib/db";
import type { Role } from "@/generated/prisma/enums";

export async function notifyUser(data: {
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
}) {
  return db.notification.create({ data });
}

/** 단지 직원 전체(또는 특정 역할)에게 알림 — 사용자별 행으로 fan-out */
export async function notifyTenant({
  tenantId,
  roles,
  type,
  title,
  body,
  link,
}: {
  tenantId: string;
  roles?: Role[];
  type: string;
  title: string;
  body?: string;
  link?: string;
}) {
  const users = await db.user.findMany({
    where: { tenantId, ...(roles ? { role: { in: roles } } : {}) },
    select: { id: true },
  });
  if (users.length === 0) return;
  await db.notification.createMany({
    data: users.map((u) => ({
      tenantId,
      userId: u.id,
      type,
      title,
      body,
      link,
    })),
  });
}
