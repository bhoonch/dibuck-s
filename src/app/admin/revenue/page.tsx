import { db } from "@/lib/db";
import { Kpi, PageTitle, Pill, Section } from "../ui";
import {
  mrrAt,
  recentMonths,
  wasExpiredTrialAt,
  wasPaidAt,
  wasTrialAt,
  won,
  wonShort,
} from "../metrics";

export default async function AdminRevenuePage() {
  const [subs, tenantCount] = await Promise.all([
    db.tenantModule.findMany({
      select: {
        status: true,
        subscribedAt: true,
        updatedAt: true,
        trialEndsAt: true,
        module: { select: { id: true, name: true, price: true, sortOrder: true } },
      },
    }),
    db.tenant.count({ where: { status: "ACTIVE" } }),
  ]);

  const now = new Date();
  const mrr = mrrAt(subs, now);
  const paid = subs.filter((s) => wasPaidAt(s, now));
  const trial = subs.filter((s) => wasTrialAt(s, now));
  // 체험이 끝났는데 유료 전환을 안 한 구독 — 결제 연동 전까지는 운영자가 수동 전환해야 할 목록
  const expired = subs.filter((s) => wasExpiredTrialAt(s, now));
  const expiredUpside = expired.reduce((sum, s) => sum + s.module.price, 0);

  // 월별 MRR — 각 달 말 기준으로 요금이 발생하던 구독의 합계
  const bars = recentMonths(7).map((m) => ({
    label: m.label,
    value: mrrAt(subs, m.end > now ? now : m.end),
  }));
  const maxBar = Math.max(1, ...bars.map((b) => b.value));

  const byModule = [
    ...paid
      .reduce((map, s) => {
        const cur = map.get(s.module.id) ?? { name: s.module.name, amount: 0 };
        cur.amount += s.module.price;
        return map.set(s.module.id, cur);
      }, new Map<string, { name: string; amount: number }>())
      .values(),
  ].sort((a, b) => b.amount - a.amount);

  // 체험이 전부 유료로 전환됐을 때 늘어날 금액
  const trialUpside = trial.reduce((sum, s) => sum + s.module.price, 0);

  return (
    <>
      <PageTitle title="수입 현황" />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="MRR" value={wonShort(mrr)} delta="체험 제외, 유료 구독만" />
        <Kpi
          label="연 환산 (ARR)"
          value={wonShort(mrr * 12)}
          delta="현재 MRR × 12"
        />
        <Kpi
          label="단지당 평균"
          value={wonShort(tenantCount ? Math.round(mrr / tenantCount) : 0)}
          delta={`운영 중 ${tenantCount}개 단지 기준`}
        />
        <Kpi
          label="체험 중 (잠재 매출)"
          value={wonShort(trialUpside)}
          delta={`${trial.length}건 전환 시`}
          tone={trial.length > 0 ? "warn" : "muted"}
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[2fr_1fr]">
        <Section title="월별 MRR 추이" meta="최근 7개월">
          <div className="flex h-[220px] items-end gap-4 px-6 py-5">
            {bars.map((b) => (
              <div
                key={b.label}
                className="flex h-full flex-1 flex-col items-center justify-end gap-2"
              >
                <span className="font-mono text-xs text-gray-600">
                  {wonShort(b.value)}
                </span>
                <div
                  className="w-full max-w-12 rounded-t-md bg-gradient-to-b from-blue-500 to-blue-600"
                  style={{ height: `${Math.max(2, (b.value / maxBar) * 100)}%` }}
                />
                <span className="font-mono text-xs text-gray-400">
                  {b.label}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="모듈별 수입" meta={`유료 ${paid.length}건`}>
          {byModule.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">유료 구독이 없습니다.</p>
          ) : (
            byModule.map((m) => (
              <div
                key={m.name}
                className="flex items-center gap-2.5 border-b border-gray-100 px-4 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-gray-700">
                  {m.name}
                </span>
                <span className="shrink-0 font-mono text-sm font-medium">
                  {won(m.amount)}
                </span>
              </div>
            ))
          )}
          <div className="space-y-2 p-4">
            {trial.length > 0 && (
              <p className="flex items-center gap-2 text-sm text-gray-600">
                <Pill tone="warn">체험 {trial.length}건</Pill>
                전환되면 월 {won(trialUpside)} 추가
              </p>
            )}
            {expired.length > 0 && (
              <p className="flex items-center gap-2 text-sm text-gray-600">
                <Pill tone="danger">전환 대기 {expired.length}건</Pill>
                체험 종료·잠김 — 전환하면 월 {won(expiredUpside)} 추가
              </p>
            )}
            <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs text-gray-600">
              결제 연동 전이라 금액은 구독 중인 모듈의{" "}
              <b className="font-mono text-amber-700">정가 기준 추정치</b>입니다.
              실제 청구·미수금은 결제 모듈 도입 후 표시됩니다.
            </p>
          </div>
        </Section>
      </div>
    </>
  );
}
