import Link from "next/link";
import { db } from "@/lib/db";
import {
  Bar,
  Kpi,
  PageTitle,
  Pill,
  Section,
  TwoLine,
  btnRowPrimary,
  tableHead,
  tableRow,
} from "../ui";
import { recentMonths, won, ymd } from "../metrics";

const COLS = "1fr 90px 80px 110px 80px";

export default async function AdminSubscribersPage() {
  const thisMonth = recentMonths(1)[0].start;

  const [tenants, newThisMonth, canceledThisMonth, cancels] = await Promise.all([
    db.tenant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        modules: {
          where: { status: "ACTIVE" },
          include: { module: { select: { name: true, price: true } } },
        },
      },
    }),
    db.tenant.count({ where: { createdAt: { gte: thisMonth } } }),
    db.tenantModule.count({
      where: { status: "CANCELED", updatedAt: { gte: thisMonth } },
    }),
    db.tenantModule.findMany({
      where: { status: "CANCELED" },
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: {
        tenant: { select: { name: true } },
        module: { select: { name: true } },
      },
    }),
  ]);

  const now = new Date();
  const active = tenants.filter((t) => t.status === "ACTIVE").length;
  const suspended = tenants.length - active;
  const subscribing = tenants.filter((t) => t.modules.length > 0).length;
  const isTrial = (m: { trialEndsAt: Date | null }) =>
    !!m.trialEndsAt && m.trialEndsAt > now;
  const trialTenants = tenants.filter((t) => t.modules.some(isTrial)).length;

  // 같은 단지명 재가입 = 무료 체험을 다시 받으려는 우회일 수 있다 — 자동 차단 대신 표시만
  // (동명 아파트가 전국에 흔해서 차단하면 정당한 가입을 막는다)
  const norm = (s: string) => s.replace(/\s/g, "");
  const nameCounts = new Map<string, number>();
  for (const t of tenants)
    nameCounts.set(norm(t.name), (nameCounts.get(norm(t.name)) ?? 0) + 1);

  // 최근 가입 · 해지 타임라인 — 단지 가입 / 모듈 추가 / 해지를 한 줄로 합친다
  const events = [
    ...tenants.map((t) => ({
      at: t.createdAt,
      title: `${t.name} — 신규 가입`,
      dot: "bg-green-600",
    })),
    ...tenants.flatMap((t) =>
      t.modules.map((m) => ({
        at: m.subscribedAt,
        title: `${t.name} — ${m.module.name} 구독`,
        dot: "bg-blue-600",
      })),
    ),
    ...cancels.map((c) => ({
      at: c.updatedAt,
      title: `${c.tenant.name} — ${c.module.name} 해지`,
      dot: "bg-red-600",
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 6);

  return (
    <>
      <PageTitle title="가입자 현황" />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="전체 단지"
          value={String(tenants.length)}
          delta={`운영 중 ${active} · 중지 ${suspended}`}
        />
        <Kpi
          label="이번 달 신규"
          value={String(newThisMonth)}
          delta={newThisMonth > 0 ? "이번 달 가입한 단지" : "이번 달 신규 없음"}
          tone={newThisMonth > 0 ? "success" : "muted"}
        />
        <Kpi
          label="체험 중"
          value={String(trialTenants)}
          delta={
            trialTenants > 0
              ? "무료 체험 모듈 보유"
              : `모듈 구독 단지 ${subscribing}곳`
          }
          tone={trialTenants > 0 ? "warn" : "muted"}
        />
        <Kpi
          label="이번 달 해지"
          value={String(canceledThisMonth)}
          delta={canceledThisMonth > 0 ? "모듈 구독 해지" : "해지 없음"}
          tone={canceledThisMonth > 0 ? "danger" : "muted"}
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[2fr_1fr]">
        <Section
          title="단지 목록"
          meta={`${tenants.length}개 단지`}
          action={
            <Link href="/admin/tenants/new" className={btnRowPrimary}>
              단지 등록
            </Link>
          }
        >
          <div className={tableHead} style={{ gridTemplateColumns: COLS }}>
            <span>단지</span>
            <span>세대수</span>
            <span>모듈</span>
            <span>월 요금</span>
            <span>상태</span>
          </div>
          {tenants.map((t) => {
            // 체험 중인 모듈은 요금 0원
            const fee = t.modules.reduce(
              (sum, m) => (isTrial(m) ? sum : sum + m.module.price),
              0,
            );
            const trials = t.modules.filter(isTrial).length;
            return (
              <Link
                key={t.id}
                href={`/admin/tenants/${t.id}`}
                className={tableRow}
                style={{ gridTemplateColumns: COLS }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <TwoLine title={t.name} sub={ymd(t.createdAt)} />
                  {(nameCounts.get(norm(t.name)) ?? 0) > 1 && (
                    <Pill tone="warn">동명 단지</Pill>
                  )}
                </span>
                <span className="font-mono text-sm text-gray-600">
                  {t.households?.toLocaleString() ?? "-"}
                </span>
                <span className="font-mono text-sm text-gray-600">
                  {t.modules.length}
                </span>
                <span className="font-mono text-sm text-gray-600">
                  {fee ? won(fee) : "—"}
                </span>
                <span>
                  {t.status !== "ACTIVE" ? (
                    <Pill tone="danger">중지</Pill>
                  ) : trials > 0 ? (
                    <Pill tone="warn">체험</Pill>
                  ) : (
                    <Pill tone="success">활성</Pill>
                  )}
                </span>
              </Link>
            );
          })}
        </Section>

        <Section title="최근 가입 · 해지">
          {events.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">활동 이력이 없습니다.</p>
          ) : (
            events.map((e, i) => (
              <div
                key={i}
                className="flex gap-2.5 border-b border-gray-100 px-4 py-3"
              >
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${e.dot}`}
                />
                <span className="block min-w-0">
                  <span className="block text-sm font-medium">
                    {e.title}
                  </span>
                  <span className="mt-0.5 block font-mono text-xs text-gray-400">
                    {ymd(e.at)}
                  </span>
                </span>
              </div>
            ))
          )}
          <div className="p-4">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm text-gray-700">모듈 구독 전환율</span>
              <span className="font-mono text-sm font-medium">
                {tenants.length
                  ? Math.round((subscribing / tenants.length) * 100)
                  : 0}
                %
              </span>
            </div>
            <Bar value={subscribing} max={tenants.length || 1} tone="success" />
          </div>
        </Section>
      </div>
    </>
  );
}
