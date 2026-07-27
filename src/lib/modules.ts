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
  /** 판매 중단(isActive=false)인데 기존 구독이라 계속 쓰는 중 — 신규 구독은 불가 */
  retired: boolean;
};

/**
 * 레지스트리 + 해당 단지의 구독 상태. 사이드바·런처·구독 관리가 공용으로 사용.
 *
 * isActive=false는 "신규 판매 중단"이지 "기존 구독 회수"가 아니다.
 * 목록에서 그냥 빼 버리면 이미 쓰던 단지가 모듈에 못 들어가고 해지 버튼도 사라지는데
 * TenantModule 행은 ACTIVE로 남아 운영자 화면에서는 요금이 계속 잡힌다.
 * 그래서 구독 중이면 판매 중단이어도 계속 보여 주고(retired), 미구독이면 감춘다.
 */
export async function getModulesForTenant(
  tenantId: string,
): Promise<TenantModuleInfo[]> {
  const [all, subs] = await Promise.all([
    db.module.findMany({ orderBy: { sortOrder: "asc" } }),
    db.tenantModule.findMany({
      where: { tenantId },
      select: { moduleId: true, status: true, trialEndsAt: true },
    }),
  ]);
  const activeIds = new Set(
    subs.filter((s) => s.status === "ACTIVE").map((s) => s.moduleId),
  );
  const modules = all.filter((m) => m.isActive || activeIds.has(m.id));
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
      retired: !m.isActive,
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
