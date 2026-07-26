import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function AdminMetricsPage() {
  const [tenantCount, activeSubs, modules, recentTenants, recentCancels] =
    await Promise.all([
      db.tenant.count({ where: { status: "ACTIVE" } }),
      db.tenantModule.findMany({
        where: { status: "ACTIVE" },
        include: { module: { select: { price: true } } },
      }),
      db.module.findMany({
        orderBy: { sortOrder: "asc" },
        include: {
          _count: {
            select: { subscriptions: { where: { status: "ACTIVE" } } },
          },
        },
      }),
      db.tenant.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
      db.tenantModule.findMany({
        where: { status: "CANCELED" },
        orderBy: { updatedAt: "desc" },
        take: 5,
        include: { tenant: true, module: true },
      }),
    ]);
  const mrr = activeSubs.reduce((sum, s) => sum + s.module.price, 0);

  return (
    <>
      <PageHeader title="지표" description="서비스 현황을 한눈에 봅니다." />

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "가입 단지", value: String(tenantCount) },
          { label: "MRR", value: `${mrr.toLocaleString()}원` },
          { label: "활성 구독", value: `${activeSubs.length}건` },
        ].map((k) => (
          <Card key={k.label} className="gap-1 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              {k.label}
            </p>
            <p className="font-mono text-3xl font-semibold tracking-tight">
              {k.value}
            </p>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-lg font-semibold tracking-tight">
            모듈별 구독 수
          </h2>
          <div className="grid gap-3 rounded-lg border bg-card p-4">
            {(() => {
              const max = Math.max(
                1,
                ...modules.map((m) => m._count.subscriptions),
              );
              return modules.map((m) => (
                <div key={m.id}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm text-gray-700">
                      {m.name}
                      {!m.isActive && (
                        <Badge variant="secondary" className="ml-2">
                          비활성
                        </Badge>
                      )}
                    </span>
                    <span className="font-mono text-xs text-gray-600">
                      {m._count.subscriptions}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-blue-600"
                      style={{
                        width: `${(m._count.subscriptions / max) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ));
            })()}
          </div>
        </section>

        <section className="space-y-8">
          <div>
            <h2 className="mb-3 text-lg font-semibold">최근 가입 단지</h2>
            <div className="divide-y rounded-xl border bg-card">
              {recentTenants.map((t) => (
                <Link
                  key={t.id}
                  href={`/admin/tenants/${t.id}`}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-accent/50"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {t.name}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t.createdAt.toISOString().slice(0, 10)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
          <div>
            <h2 className="mb-3 text-lg font-semibold">최근 해지</h2>
            {recentCancels.length === 0 ? (
              <p className="text-sm text-muted-foreground">해지 이력이 없습니다.</p>
            ) : (
              <div className="divide-y rounded-xl border bg-card">
                {recentCancels.map((c) => (
                  <div
                    key={`${c.tenantId}-${c.moduleId}`}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{c.tenant.name}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        — {c.module.name}
                      </span>
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {c.updatedAt.toISOString().slice(0, 10)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
