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
    return {
      id: m.id,
      name: m.name,
      description: m.description,
      icon: m.icon,
      route: m.route,
      price: m.price,
      trialDays: m.trialDays,
      subscribed: active,
      trialEndsAt:
        active && row?.trialEndsAt && row.trialEndsAt > now
          ? row.trialEndsAt
          : null,
      everSubscribed: !!row,
    };
  });
}

/** 모듈 페이지 진입 시 구독 검사용 */
export async function isSubscribed(tenantId: string, moduleId: string) {
  const sub = await db.tenantModule.findUnique({
    where: { tenantId_moduleId: { tenantId, moduleId } },
  });
  return sub?.status === "ACTIVE";
}
