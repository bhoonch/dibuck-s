/**
 * 전 단지 공지 배너의 발송 대상 판정.
 * 순수 함수만 두어 `npx tsx announcements.test.ts` 로 검증한다.
 */

export const announcementTargets = {
  ALL: "전체 단지",
  SUBSCRIBED: "구독 중인 단지",
  UNSUBSCRIBED: "미구독 단지",
  TRIAL: "무료 체험 중인 단지",
  MODULE: "특정 모듈 구독 단지",
  MODULE_NOT: "특정 모듈 미구독 단지",
  TENANTS: "직접 선택한 단지",
} as const;

export type AnnouncementTarget = keyof typeof announcementTargets;

/** 값(모듈 / 단지 목록)을 함께 골라야 하는 대상 */
export const targetNeedsModule = (t: string) =>
  t === "MODULE" || t === "MODULE_NOT";
export const targetNeedsTenants = (t: string) => t === "TENANTS";

/**
 * 대상이 좁을수록 낮은 값. 한 단지에 여러 공지가 걸리면 가장 좁은 것 하나만 노출한다
 * — "전체 공지"가 그 단지에만 보내는 안내를 덮어쓰지 않게 하기 위함.
 */
const specificity: Record<string, number> = {
  TENANTS: 0,
  MODULE: 1,
  MODULE_NOT: 1,
  TRIAL: 2,
  SUBSCRIBED: 3,
  UNSUBSCRIBED: 3,
  ALL: 4,
};

export type TenantFacts = {
  tenantId: string;
  /** 구독 중(ACTIVE)인 모듈 id — 체험 중인 것도 포함 */
  subscribedModuleIds: string[];
  /** 그중 아직 체험 기간이 남은 모듈 id */
  trialModuleIds: string[];
};

export type TargetedAnnouncement = {
  target: string;
  targetValue: string | null;
};

export function matchesTarget(a: TargetedAnnouncement, f: TenantFacts) {
  switch (a.target) {
    case "ALL":
      return true;
    case "SUBSCRIBED":
      return f.subscribedModuleIds.length > 0;
    case "UNSUBSCRIBED":
      return f.subscribedModuleIds.length === 0;
    case "TRIAL":
      return f.trialModuleIds.length > 0;
    case "MODULE":
      return !!a.targetValue && f.subscribedModuleIds.includes(a.targetValue);
    case "MODULE_NOT":
      return !!a.targetValue && !f.subscribedModuleIds.includes(a.targetValue);
    case "TENANTS":
      return parseTenantIds(a.targetValue).includes(f.tenantId);
    default:
      return false;
  }
}

export const parseTenantIds = (value: string | null | undefined) =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * 게시 기간을 이미 통과한 공지 목록(최신순)에서 이 단지에 보여줄 하나를 고른다.
 * 좁은 대상 우선, 같은 범위면 최신 것.
 */
export function pickAnnouncement<T extends TargetedAnnouncement>(
  announcements: T[],
  facts: TenantFacts,
): T | undefined {
  let best: T | undefined;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const a of announcements) {
    if (!matchesTarget(a, facts)) continue;
    const rank = specificity[a.target] ?? 9;
    if (rank < bestRank) {
      best = a;
      bestRank = rank;
    }
  }
  return best;
}

/** 목록 화면용 — "특정 모듈 구독 단지" 처럼 값까지 붙여 읽어준다 */
export function describeTarget(
  a: TargetedAnnouncement,
  moduleNames: Record<string, string> = {},
  tenantCount?: number,
) {
  const base = announcementTargets[a.target as AnnouncementTarget] ?? a.target;
  if (targetNeedsModule(a.target) && a.targetValue) {
    const name = moduleNames[a.targetValue] ?? a.targetValue;
    return a.target === "MODULE" ? `${name} 구독` : `${name} 미구독`;
  }
  if (targetNeedsTenants(a.target)) {
    const n = tenantCount ?? parseTenantIds(a.targetValue).length;
    return `단지 ${n}곳 지정`;
  }
  return base;
}
