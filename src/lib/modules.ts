import { db } from "@/lib/db";

export type TenantModuleInfo = {
  id: string;
  name: string;
  description: string;
  icon: string;
  route: string;
  price: number;
  subscribed: boolean;
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
      where: { tenantId, status: "ACTIVE" },
      select: { moduleId: true },
    }),
  ]);
  const subscribed = new Set(subs.map((s) => s.moduleId));
  return modules.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    icon: m.icon,
    route: m.route,
    price: m.price,
    subscribed: subscribed.has(m.id),
  }));
}

/** 모듈 페이지 진입 시 구독 검사용 */
export async function isSubscribed(tenantId: string, moduleId: string) {
  const sub = await db.tenantModule.findUnique({
    where: { tenantId_moduleId: { tenantId, moduleId } },
  });
  return sub?.status === "ACTIVE";
}
