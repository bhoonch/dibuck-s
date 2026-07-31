import { ymdKst } from "@/lib/utils";
/** 관리자 지표 계산 공용 헬퍼 — 단지 수 규모에서는 JS 집계로 충분하다. */

export type SubRow = {
  status: string;
  subscribedAt: Date;
  updatedAt: Date;
  trialEndsAt: Date | null;
  /** 단지에 결제 카드가 있는가 — 체험이 끝난 구독은 카드가 있어야만 청구된다 */
  hasCard: boolean;
  module: { price: number };
};

/** 최근 n개월 구간 (과거 → 현재). end는 다음 달 1일(배타적). */
export function recentMonths(n: number) {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const offset = n - 1 - i;
    const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 1);
    return { label: `${start.getMonth() + 1}월`, start, end };
  });
}

/** 해당 시점(at)에 살아 있던 구독인가 — 해지분은 updatedAt이 해지 시각이다. */
export function wasActiveAt(s: SubRow, at: Date) {
  return s.subscribedAt < at && (s.status === "ACTIVE" || s.updatedAt >= at);
}

/** 그 시점에 무료 체험 중이었나 — 체험은 매출 0원 */
export function wasTrialAt(s: SubRow, at: Date) {
  return wasActiveAt(s, at) && !!s.trialEndsAt && s.trialEndsAt > at;
}

/** 그 시점에 요금이 발생하던 구독인가 — 체험이 끝났고 카드가 등록된 구독.
 * "trialEndsAt null만 유료"로 보면 안 된다 — 셀프 전환 단지는 체험 소진 이력으로
 * trialEndsAt이 과거로 남아, 전환 단지 전체가 MRR 0원·"전환 대기"로 잡힌다.
 * ponytail: 카드 유무는 현재 상태라 과거 월 막대는 근사치다. 정확히 하려면
 * Payment 이력으로 집계할 것(월별 매출을 진지하게 보게 되면 그때). */
export function wasPaidAt(s: SubRow, at: Date) {
  return (
    wasActiveAt(s, at) && (!s.trialEndsAt || s.trialEndsAt <= at) && s.hasCard
  );
}

/** 체험이 끝났는데 카드 미등록 — 잠긴 상태, 카드를 넣으면 매출로 바뀔 목록 */
export function wasExpiredTrialAt(s: SubRow, at: Date) {
  return (
    wasActiveAt(s, at) && !!s.trialEndsAt && s.trialEndsAt <= at && !s.hasCard
  );
}

/** 해당 시점의 MRR — 체험 중인 구독은 빼고 센다 */
export function mrrAt(subs: SubRow[], at: Date) {
  return subs.reduce((sum, s) => (wasPaidAt(s, at) ? sum + s.module.price : sum), 0);
}

export const won = (n: number) => `₩ ${n.toLocaleString()}`;


export function deltaPercent(current: number, previous: number) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

export const ymd = ymdKst;
