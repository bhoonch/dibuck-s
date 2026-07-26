import { notFound } from "next/navigation";
import { MonitorSmartphone } from "lucide-react";
import { db } from "@/lib/db";
import { roleLabels } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  impersonate,
  setTenantStatus,
  toggleTenantModule,
} from "../../actions";

export default async function AdminTenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tenant = await db.tenant.findUnique({
    where: { id },
    include: {
      users: { orderBy: { createdAt: "asc" } },
      modules: true,
    },
  });
  if (!tenant) notFound();

  const modules = await db.module.findMany({ orderBy: { sortOrder: "asc" } });
  const activeSet = new Set(
    tenant.modules.filter((m) => m.status === "ACTIVE").map((m) => m.moduleId),
  );

  return (
    <>
      <PageHeader title={tenant.name} description={tenant.address ?? undefined}>
        <form action={impersonate}>
          <input type="hidden" name="tenantId" value={tenant.id} />
          <Button type="submit">
            <MonitorSmartphone className="size-4" /> 사용자 화면으로 전환
          </Button>
        </form>
      </PageHeader>

      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        <Card className="gap-3 p-5">
          <h2 className="font-semibold">기본 정보</h2>
          <dl className="space-y-1.5 text-sm">
            <div className="flex gap-2">
              <dt className="w-20 text-muted-foreground">세대수</dt>
              <dd>{tenant.households ?? "-"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 text-muted-foreground">동 구성</dt>
              <dd>{tenant.buildingInfo ?? "-"}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 text-muted-foreground">가입일</dt>
              <dd>{tenant.createdAt.toISOString().slice(0, 10)}</dd>
            </div>
            <div className="flex items-center gap-2">
              <dt className="w-20 text-muted-foreground">상태</dt>
              <dd className="flex items-center gap-3">
                {tenant.status === "ACTIVE" ? (
                  <Badge className="bg-success/10 text-success">운영 중</Badge>
                ) : (
                  <Badge variant="destructive">중지</Badge>
                )}
                <form action={setTenantStatus}>
                  <input type="hidden" name="tenantId" value={tenant.id} />
                  <input
                    type="hidden"
                    name="status"
                    value={tenant.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE"}
                  />
                  <Button type="submit" variant="outline" size="sm">
                    {tenant.status === "ACTIVE" ? "이용 중지" : "재개"}
                  </Button>
                </form>
              </dd>
            </div>
          </dl>
        </Card>

        <Card className="gap-3 p-5">
          <h2 className="font-semibold">직원 ({tenant.users.length}명)</h2>
          <ul className="space-y-1.5 text-sm">
            {tenant.users.map((u) => (
              <li key={u.id} className="flex items-center gap-2">
                <span className="font-medium">{u.name}</span>
                <Badge variant="secondary">{roleLabels[u.role]}</Badge>
                <span className="text-muted-foreground">{u.email}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="gap-3 p-5 lg:col-span-2">
          <h2 className="font-semibold">구독 모듈 (feature flag)</h2>
          <div className="divide-y">
            {modules.map((m) => {
              const on = activeSet.has(m.id);
              return (
                <div key={m.id} className="flex items-center gap-3 py-2.5">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{m.name}</span>
                    <span className="ml-2 text-sm text-muted-foreground">
                      월 {m.price.toLocaleString()}원
                    </span>
                  </span>
                  {on && (
                    <Badge className="bg-success/10 text-success">활성</Badge>
                  )}
                  <form action={toggleTenantModule}>
                    <input type="hidden" name="tenantId" value={tenant.id} />
                    <input type="hidden" name="moduleId" value={m.id} />
                    <input type="hidden" name="subscribe" value={String(!on)} />
                    <Button
                      type="submit"
                      variant={on ? "outline" : "default"}
                      size="sm"
                    >
                      {on ? "비활성화" : "활성화"}
                    </Button>
                  </form>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </>
  );
}
