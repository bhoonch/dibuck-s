import { db } from "@/lib/db";

/**
 * 셀프 탈퇴 유예 — 요청하면 30일 뒤에 실제로 지운다.
 *
 * 즉시 삭제는 홧김에 누른 한 번으로 법정 보존 대상 문서(관리 서류 5년)까지
 * 없애 버린다. 유예 동안은 평소처럼 쓸 수 있고 언제든 취소할 수 있으며,
 * 그 사실을 앱 상단 배너가 계속 알린다. 개인정보 삭제 요구 대응이라는 목적은
 * 그대로다 — 운영자 문의 없이 사용자가 스스로 끝낼 수 있다.
 */
export const DELETE_GRACE_DAYS = 30;

/** 남은 유예 일수 (0이면 오늘 지워질 차례) */
export const graceDaysLeft = (requestedAt: Date, now = new Date()) =>
  Math.max(
    0,
    DELETE_GRACE_DAYS -
      Math.floor((now.getTime() - requestedAt.getTime()) / 86400000),
  );

/** 유예가 끝났는가 */
export const graceOver = (requestedAt: Date, now = new Date()) =>
  now.getTime() - requestedAt.getTime() >= DELETE_GRACE_DAYS * 86400000;

/**
 * 단지와 그 안의 모든 데이터를 지운다.
 * Tenant의 자식 관계에는 cascade가 없어 순서대로 직접 지운다.
 */
export async function purgeTenant(tenantId: string) {
  await db.$transaction([
    db.notification.deleteMany({ where: { tenantId } }),
    db.document.deleteMany({ where: { tenantId } }),
    db.unit.deleteMany({ where: { tenantId } }),
    db.inquiry.deleteMany({ where: { tenantId } }),
    db.tenantModule.deleteMany({ where: { tenantId } }),
    db.payment.deleteMany({ where: { tenantId } }),
    db.billing.deleteMany({ where: { tenantId } }),
    db.user.deleteMany({ where: { tenantId } }),
    db.tenant.delete({ where: { id: tenantId } }),
  ]);
}

/** 크론에서 호출 — 유예가 끝난 단지를 지운다. 지운 수를 돌려준다 */
export async function purgeExpiredTenants(now = new Date()) {
  const due = new Date(now.getTime() - DELETE_GRACE_DAYS * 86400000);
  const tenants = await db.tenant.findMany({
    where: { deleteRequestedAt: { not: null, lte: due } },
    select: { id: true },
  });
  for (const t of tenants) await purgeTenant(t.id);
  return tenants.length;
}
