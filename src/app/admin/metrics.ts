/** 관리자 지표 계산 공용 헬퍼 — 단지 수 규모에서는 JS 집계로 충분하다. */

export type SubRow = {
  status: string;
  subscribedAt: Date;
  updatedAt: Date;
  trialEndsAt: Date | null;
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

/** 그 시점에 요금이 발생하던 구독인가 */
export function wasPaidAt(s: SubRow, at: Date) {
  return wasActiveAt(s, at) && !wasTrialAt(s, at);
}

/** 해당 시점의 MRR — 체험 중인 구독은 빼고 센다 */
export function mrrAt(subs: SubRow[], at: Date) {
  return subs.reduce((sum, s) => (wasPaidAt(s, at) ? sum + s.module.price : sum), 0);
}

export const won = (n: number) => `₩ ${n.toLocaleString()}`;

/** 큰 금액 축약 표기 (₩ 18.6M) */
export function wonShort(n: number) {
  if (n >= 100_000_000) return `₩ ${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `₩ ${(n / 10_000).toLocaleString(undefined, { maximumFractionDigits: 0 })}만`;
  return won(n);
}

export function deltaPercent(current: number, previous: number) {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

export const ymd = (d: Date) => d.toISOString().slice(0, 10);
