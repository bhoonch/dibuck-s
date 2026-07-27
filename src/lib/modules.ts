import { db } from "@/lib/db";

export type TenantModuleInfo = {
  id: string;
  name: string;
  description: string;
  icon: string;
  route: string;
  price: number;
  /** 이 모듈의 무료 체험 표준 기간(일) — 모듈 관리에서 설정, 0이면 체험 없음 */
  trialDays: number;
  subscribed: boolean;
  /** 구독 중이면서 아직 무료 체험 기간이 남아 있으면 종료일, 아니면 null */
  trialEndsAt: Date | null;
  /** 체험이 끝났는데 유료 전환 전 — 모듈 잠금, 셀프 재구독 불가(유료 전환 문의) */
  trialExpired: boolean;
  /** 한 번이라도 구독한 적 있는가 — 무료 체험은 모듈당 최초 1회 */
  everSubscribed: boolean;
};

/** 레지스트리 전체 + 해당 단지의 구독 여부. 사이드바·런처가 공용으로 사용 */
export async function getModulesForTenant(
  tenantId: string,
): Promise<TenantModuleInfo[]> {
  const [modules, subs] = await Promise.all([
    db.module.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.tenantModule.findMany({
      where: { tenantId },
      select: { moduleId: true, status: true, trialEndsAt: true },
    }),
  ]);
  const now = new Date();
  const rows = new Map(subs.map((s) => [s.moduleId, s]));
  return modules.map((m) => {
    const row = rows.get(m.id);
    const active = row?.status === "ACTIVE";
    // 체험 종료 후 미전환(trialEndsAt이 과거인 채 남아 있음) — 결제 연동(로드맵 5.6) 전까지는
    // 잠그고 유료 전환 문의로 안내한다. 전환하면 운영자가 trialEndsAt을 null로 지운다.
    // 스스로 해지한 모듈은 잠긴 게 아니라 안 쓰는 것 — 만료 배너를 띄우면 안 된다.
    const expired = active && !!row.trialEndsAt && row.trialEndsAt <= now;
    return {
      id: m.id,
      name: m.name,
      description: m.description,
      icon: m.icon,
      route: m.route,
      price: m.price,
      trialDays: m.trialDays,
      subscribed: active && !expired,
      trialEndsAt: active && !expired ? (row?.trialEndsAt ?? null) : null,
      trialExpired: expired,
      everSubscribed: !!row,
    };
  });
}

/** 모듈 페이지 진입 시 구독 검사용 */
export async function isSubscribed(tenantId: string, moduleId: string) {
  const sub = await db.tenantModule.findUnique({
    where: { tenantId_moduleId: { tenantId, moduleId } },
  });
  return (
    sub?.status === "ACTIVE" &&
    (!sub.trialEndsAt || sub.trialEndsAt > new Date())
  );
}
