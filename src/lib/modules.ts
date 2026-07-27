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
  /** 체험이 끝났는데 카드도 없음 — 모듈 잠금, 카드 등록으로 풀린다 */
  trialExpired: boolean;
  /** 한 번이라도 구독한 적 있는가 — 무료 체험은 모듈당 최초 1회 */
  everSubscribed: boolean;
  /** 판매 중단(isActive=false)인데 기존 구독이라 계속 쓰는 중 — 신규 구독은 불가 */
  retired: boolean;
  /** 결제 실패 유예 초과로 단지 전체가 정지 — 재결제하면 즉시 풀린다 */
  suspended: boolean;
};

/**
 * 레지스트리 + 해당 단지의 구독 상태. 사이드바·런처·구독 관리가 공용으로 사용.
 *
 * isActive=false는 "신규 판매 중단"이지 "기존 구독 회수"가 아니다.
 * 목록에서 그냥 빼 버리면 이미 쓰던 단지가 모듈에 못 들어가고 해지 버튼도 사라지는데
 * TenantModule 행은 ACTIVE로 남아 운영자 화면에서는 요금이 계속 잡힌다.
 * 그래서 구독 중이면 판매 중단이어도 계속 보여 주고(retired), 미구독이면 감춘다.
 *
 * 잠금은 두 가지다:
 *  - 체험 만료 + 카드 미등록 → 그 모듈만 잠금(카드 등록하면 결제로 이어지고 풀린다)
 *  - 결제 실패 유예 초과(SUSPENDED) → 단지의 전 모듈 잠금(재결제하면 풀린다)
 */
export async function getModulesForTenant(
  tenantId: string,
): Promise<TenantModuleInfo[]> {
  const [all, subs, billing] = await Promise.all([
    db.module.findMany({ orderBy: { sortOrder: "asc" } }),
    db.tenantModule.findMany({
      where: { tenantId },
      select: { moduleId: true, status: true, trialEndsAt: true },
    }),
    db.billing.findUnique({
      where: { tenantId },
      select: { status: true, billingKey: true },
    }),
  ]);
  const activeIds = new Set(
    subs.filter((s) => s.status === "ACTIVE").map((s) => s.moduleId),
  );
  const modules = all.filter((m) => m.isActive || activeIds.has(m.id));
  const now = new Date();
  const rows = new Map(subs.map((s) => [s.moduleId, s]));
  // 카드가 등록돼 있으면 체험 만료는 잠금이 아니라 청구로 이어진다
  const hasCard = !!billing?.billingKey;
  const suspended = billing?.status === "SUSPENDED";

  return modules.map((m) => {
    const row = rows.get(m.id);
    const active = row?.status === "ACTIVE";
    // 스스로 해지한 모듈은 잠긴 게 아니라 안 쓰는 것 — 만료 배너를 띄우면 안 된다
    const expired =
      active && !hasCard && !!row.trialEndsAt && row.trialEndsAt <= now;
    const usable = active && !expired && !suspended;
    return {
      id: m.id,
      name: m.name,
      description: m.description,
      icon: m.icon,
      route: m.route,
      price: m.price,
      trialDays: m.trialDays,
      subscribed: usable,
      trialEndsAt: usable ? (row?.trialEndsAt ?? null) : null,
      trialExpired: expired,
      everSubscribed: !!row,
      retired: !m.isActive,
      suspended: active && suspended,
    };
  });
}

/** 모듈 페이지 진입 시 구독 검사용 */
export async function isSubscribed(tenantId: string, moduleId: string) {
  const [sub, billing] = await Promise.all([
    db.tenantModule.findUnique({
      where: { tenantId_moduleId: { tenantId, moduleId } },
    }),
    db.billing.findUnique({
      where: { tenantId },
      select: { status: true, billingKey: true },
    }),
  ]);
  if (sub?.status !== "ACTIVE") return false;
  if (billing?.status === "SUSPENDED") return false;
  // 체험이 끝났어도 카드가 있으면 계속 쓴다 — 다음 청구일에 결제된다
  return !sub.trialEndsAt || sub.trialEndsAt > new Date() || !!billing?.billingKey;
}
