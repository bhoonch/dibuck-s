import Link from "next/link";
import { db } from "@/lib/db";
import { Kpi, Money, PageTitle, Pill, Section, tableRow } from "../ui";
import {
  mrrAt,
  recentMonths,
  wasExpiredTrialAt,
  wasPaidAt,
  wasTrialAt,
  won,
  ymd,
} from "../metrics";
import { requireAdmin } from "@/lib/auth";

export default async function AdminRevenuePage() {
  await requireAdmin();
  const [subs, tenantCount, overdue] = await Promise.all([
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
    // 미수금 — 결제가 실패해 유예 중이거나 정지된 단지의 마지막 실패 청구액
    db.billing.findMany({
      where: { status: { in: ["PAST_DUE", "SUSPENDED"] } },
      select: {
        tenantId: true,
        payments: {
          where: { status: "FAILED" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { amount: true },
        },
      },
    }),
  ]);
  const overdueAmount = overdue.reduce(
    (sum, b) => sum + (b.payments[0]?.amount ?? 0),
    0,
  );

  // 이탈 위험: 7일 안에 체험이 끝나는데 카드가 없는 단지. 단지 단위로 묶는다
  const asOf = new Date();
  const soon = new Date(asOf.getTime() + 7 * 86400000);
  const risky = await db.tenantModule.findMany({
    where: {
      status: "ACTIVE",
      trialEndsAt: { gt: asOf, lte: soon },
      tenant: { status: "ACTIVE", OR: [{ billing: null }, { billing: { billingKey: null } }] },
    },
    include: {
      module: { select: { name: true } },
      tenant: { select: { id: true, name: true } },
    },
    orderBy: { trialEndsAt: "asc" },
  });
  const riskMap = new Map<
    string,
    { tenantId: string; tenantName: string; modules: string[]; endsAt: Date }
  >();
  for (const r of risky) {
    const hit = riskMap.get(r.tenant.id);
    if (hit) hit.modules.push(r.module.name);
    else
      riskMap.set(r.tenant.id, {
        tenantId: r.tenant.id,
        tenantName: r.tenant.name,
        modules: [r.module.name],
        endsAt: r.trialEndsAt!,
      });
  }
  const atRisk = [...riskMap.values()].map((r) => ({
    ...r,
    modules: r.modules.join(", "),
    daysLeft: Math.max(
      1,
      Math.ceil((r.endsAt.getTime() - asOf.getTime()) / 86400000),
    ),
  }));

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
        <Kpi label="MRR" value={<Money n={mrr} short />} delta="체험 제외, 유료 구독만" />
        <Kpi
          label="연 환산 (ARR)"
          value={<Money n={mrr * 12} short />}
          delta="현재 MRR × 12"
        />
        <Kpi
          label="단지당 평균"
          value={<Money n={tenantCount ? Math.round(mrr / tenantCount) : 0} short />}
          delta={`운영 중 ${tenantCount}개 단지 기준`}
        />
        <Kpi
          label="체험 중 (잠재 매출)"
          value={<Money n={trialUpside} short />}
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
                  <Money n={b.value} short />
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
                  <Money n={m.amount} />
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
            {overdue.length > 0 && (
              <p className="flex items-center gap-2 text-sm text-gray-600">
                <Pill tone="danger">미수 {overdue.length}곳</Pill>
                결제 실패 {won(overdueAmount)} — 유예 중이거나 정지된 단지
              </p>
            )}
            <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs text-gray-600">
              위 금액은 구독 중인 모듈의{" "}
              <b className="text-amber-700">정가 기준</b>입니다. 실제 청구된
              금액은 각 단지 상세의 결제 내역에서 확인하세요.
            </p>
          </div>
        </Section>
      </div>

      {/* 이탈 위험 — 체험이 곧 끝나는데 카드가 없다. 그대로 두면 잠기고 그대로 떠난다 */}
      <Section title="이탈 위험 — 체험 D-7, 카드 미등록">
        {atRisk.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-gray-500">
            체험 종료가 임박한 카드 미등록 단지가 없습니다.
          </p>
        ) : (
          atRisk.map((r) => (
            <div
              key={r.tenantId}
              className={tableRow}
              style={{ gridTemplateColumns: "1fr 200px 110px 90px" }}
            >
              <Link
                href={`/admin/tenants/${r.tenantId}`}
                className="truncate text-sm font-medium text-blue-700 hover:underline"
              >
                {r.tenantName}
              </Link>
              <span className="truncate text-sm text-gray-600">{r.modules}</span>
              <span className="font-mono text-xs text-gray-500">{ymd(r.endsAt)}</span>
              <span className="text-right">
                <Pill tone={r.daysLeft <= 3 ? "danger" : "warn"}>
                  D-{r.daysLeft}
                </Pill>
              </span>
            </div>
          ))
        )}
      </Section>
    </>
  );
}
