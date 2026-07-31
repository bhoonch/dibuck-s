"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { chargeTenant } from "@/lib/billing-run";

/**
 * 결제창에 넘길 customerKey를 확보한다. 단지 id를 그대로 쓰지 않는 이유는
 * 빌링키가 customerKey와 짝으로만 결제되기 때문 — 추측 가능한 값이면 안 된다.
 */
export async function ensureCustomerKey() {
  const session = await requireRole(Role.DIRECTOR);
  const tenantId = session.tenantId!;
  const existing = await db.billing.findUnique({ where: { tenantId } });
  if (existing) return existing.customerKey;
  const created = await db.billing.create({
    data: { tenantId, customerKey: randomUUID() },
  });
  return created.customerKey;
}

/** 결제 실패로 정지·유예 중일 때 "지금 결제하기" — 크론과 같은 경로를 탄다 */
export async function payNow() {
  const session = await requireRole(Role.DIRECTOR);
  const result = await chargeTenant(session.tenantId!);
  revalidatePath("/", "layout");
  return result.ok
    ? { success: true }
    : { error: result.reason };
}

/** 카드 해지 — 다음 청구일에 실제로 끊긴다. 이미 낸 기간은 끝까지 쓴다 */
export async function requestCancel() {
  const session = await requireRole(Role.DIRECTOR);
  await db.billing.update({
    where: { tenantId: session.tenantId! },
    data: { cancelRequestedAt: new Date() },
  });
  revalidatePath("/billing");
}

/** 해지 예약 철회 */
export async function undoCancel() {
  const session = await requireRole(Role.DIRECTOR);
  await db.billing.update({
    where: { tenantId: session.tenantId! },
    data: { cancelRequestedAt: null },
  });
  revalidatePath("/billing");
}
