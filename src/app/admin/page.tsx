import Link from "next/link";
import { db } from "@/lib/db";
import {
  Bar,
  Kpi,
  Money,
  PageTitle,
  Pill,
  Section,
  TwoLine,
  btnRow,
  tableHead,
  tableRow,
} from "./ui";
import { mrrAt, recentMonths, deltaPercent, ymd } from "./metrics";
import { requireAdmin } from "@/lib/auth";

const COLS = "1fr 90px 90px 90px 90px";

export default async function AdminOverviewPage() {
  await requireAdmin();
  const months = recentMonths(2);
  const thisMonth = months[1].start;

  const [
    tenants,
    activeSubs,
    allSubs,
    modules,
    newThisMonth,
    canceledThisMonth,
    tenantCount,
  ] = await Promise.all([
      db.tenant.findMany({
        orderBy: { createdAt: "desc" },
        take: 6,
        include: {
          _count: { select: { modules: { where: { status: "ACTIVE" } } } },
        },
      }),
      db.tenantModule.count({ where: { status: "ACTIVE" } }),
      db.tenantModule.findMany({
        select: {
          status: true,
          subscribedAt: true,
          updatedAt: true,
          trialEndsAt: true,
          module: { select: { price: true } },
        },
      }),
      db.module.findMany({
        orderBy: { sortOrder: "asc" },
        include: {
          _count: { select: { subscriptions: { where: { status: "ACTIVE" } } } },
        },
      }),
      db.tenant.count({ where: { createdAt: { gte: thisMonth } } }),
      db.tenantModule.count({
        where: { status: "CANCELED", updatedAt: { gte: thisMonth } },
      }),
      db.tenant.count({ where: { status: "ACTIVE" } }),
    ]);

  const now = new Date();
  const mrr = mrrAt(allSubs, now);
  const mrrPrev = mrrAt(allSubs, thisMonth);
  const growth = deltaPercent(mrr, mrrPrev);
  const avgModules = tenantCount ? (activeSubs / tenantCount).toFixed(1) : "0";
  const maxSubs = Math.max(1, ...modules.map((m) => m._count.subscriptions));

  return (
    <>
      <PageTitle eyebrow="ADMIN CONSOLE" title="운영 지표" />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="가입 단지"
          value={String(tenantCount)}
          delta={`▲ ${newThisMonth} (이번 달)`}
          tone={newThisMonth > 0 ? "success" : "muted"}
        />
        <Kpi
          label="MRR"
          value={<Money n={mrr} short />}
          delta={
            growth === null
              ? "비교할 지난달 데이터 없음"
              : `${growth >= 0 ? "▲" : "▼"} ${Math.abs(growth).toFixed(1)}% vs 지난달`
          }
          tone={growth !== null && growth < 0 ? "danger" : "success"}
        />
        <Kpi
          label="모듈 구독"
          value={String(activeSubs)}
          delta={`단지 평균 ${avgModules}개`}
        />
        <Kpi
          label="이번 달 해지"
          value={String(canceledThisMonth)}
          delta={canceledThisMonth > 0 ? "구독 해지 건수" : "해지 없음"}
          tone={canceledThisMonth > 0 ? "danger" : "muted"}
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[2fr_1fr]">
        <Section title="단지 관리" meta={`${tenantCount}개 단지`}>
          <div className={tableHead} style={{ gridTemplateColumns: COLS }}>
            <span>단지</span>
            <span>세대수</span>
            <span>모듈</span>
            <span>상태</span>
            <span />
          </div>
          {tenants.map((t) => (
            <div
              key={t.id}
              className={tableRow}
              style={{ gridTemplateColumns: COLS }}
            >
              <TwoLine title={t.name} sub={ymd(t.createdAt)} />
              <span className="font-mono text-sm text-gray-600">
                {t.households?.toLocaleString() ?? "-"}
              </span>
              <span className="font-mono text-sm text-gray-600">
                {t._count.modules}
              </span>
              <span>
                {t.status === "ACTIVE" ? (
                  <Pill tone="success">활성</Pill>
                ) : (
                  <Pill tone="danger">중지</Pill>
                )}
              </span>
              <span>
                <Link href={`/admin/tenants/${t.id}`} className={btnRow}>
                  상세
                </Link>
              </span>
            </div>
          ))}
        </Section>

        <Section title="모듈별 구독" bodyClassName="grid gap-3 p-4">
          {modules.map((m) => (
            <div key={m.id}>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-sm text-gray-700">{m.name}</span>
                <span className="font-mono text-xs text-gray-600">
                  {m._count.subscriptions}
                </span>
              </div>
              <Bar value={m._count.subscriptions} max={maxSubs} />
            </div>
          ))}
        </Section>
      </div>
    </>
  );
}
