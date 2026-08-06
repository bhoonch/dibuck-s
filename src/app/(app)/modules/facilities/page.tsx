import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpenCheck, FilePlus2, ListChecks } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { ymdKst } from "@/lib/utils";
import { cycleLabel, type Cycle } from "@/lib/inspection/catalog";
import {
  daysUntil,
  nextDue,
  statusOf,
  type InspectionStatus,
} from "@/lib/inspection/schedule";
import { STATUS_PILL, STATUS_RANK, toneOf } from "@/lib/inspection/status";
import { docStatusLabels, docStatusStyles } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SummaryBox, SummaryStat } from "@/components/ui/summary-box";
import { AttentionCard } from "@/components/attention-card";

export default async function InspectionHomePage() {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "facilities"))) redirect("/subscriptions");

  const [items, docs] = await Promise.all([
    db.inspectionItem.findMany({
      where: { tenantId, active: true },
      orderBy: { createdAt: "asc" },
    }),
    // 현황판은 "지금 할 일"만 — 전체 기록(검색·정렬)은 /records, 감사 대응은 서류철이 담당
    db.document.findMany({
      where: { tenantId, type: "inspection" },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        docNo: true,
        status: true,
        meta: true,
        dueDate: true,
        createdAt: true,
      },
    }),
  ]);

  // 항목이 하나도 없으면(비활성 포함) 마법사가 온보딩의 전부다
  if (items.length === 0) {
    const any = await db.inspectionItem.count({ where: { tenantId } });
    if (any === 0) redirect("/modules/facilities/setup");
  }

  // 도래일은 저장하지 않는다 — 열 때마다 순수 함수로 계산해 항상 정확하다
  const now = new Date();
  const rows = items
    .map((it) => {
      const due = nextDue(it);
      const status = statusOf(it, now);
      return {
        ...it,
        due,
        status,
        left: due ? daysUntil(due, now) : null,
      };
    })
    .sort(
      (a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
        (a.left ?? 0) - (b.left ?? 0),
    );

  const count = (s: InspectionStatus) => rows.filter((r) => r.status === s).length;
  const overdue = rows.filter((r) => r.status === "overdue");
  const needsAnchor = rows.filter((r) => r.status === "needsAnchor");

  return (
    <div className="space-y-6">
      <PageHeader
        title="법정점검 대장"
        description="법정 주기는 앱이 셉니다. 점검을 마치면 기록 한 번으로 일지·대장·감사 서류철이 함께 쌓입니다."
      >
        <Button asChild variant="outline" size="lg">
          <Link href="/modules/facilities/items">
            <ListChecks className="size-4" /> 항목 관리
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/modules/facilities/binder">
            <BookOpenCheck className="size-4" /> 감사 서류철
          </Link>
        </Button>
        <Button asChild size="lg">
          <Link href="/modules/facilities/new">
            <FilePlus2 className="size-4" /> 기록 작성
          </Link>
        </Button>
      </PageHeader>

      {overdue.length > 0 && (
        <AttentionCard title={`기한이 지난 점검이 ${overdue.length}건 있습니다`}>
          {overdue.map((r) => r.name).join(" · ")} — 미실시 시 과태료 대상이 될 수
          있습니다. 점검을 마쳤다면 [기록 작성]으로 실시 기록을 남겨 주세요.
        </AttentionCard>
      )}
      {overdue.length === 0 && needsAnchor.length > 0 && (
        <AttentionCard title={`기준일이 없는 항목이 ${needsAnchor.length}건 있습니다`}>
          마지막 실시일을 모르면 다음 도래일을 셀 수 없습니다 — [항목 관리]에서
          기준일을 넣거나, 이번 점검을 마친 뒤 기록을 남기면 자동으로 채워집니다.
        </AttentionCard>
      )}

      <SummaryBox>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryStat label="지연" value={`${count("overdue")}건`} note="기한 경과 — 바로 처리" />
          <SummaryStat label="임박" value={`${count("imminent")}건`} note="준비 리드타임 안" />
          <SummaryStat label="기준일 필요" value={`${count("needsAnchor")}건`} note="마지막 실시일 미입력" />
          <SummaryStat label="정상" value={`${count("ok")}건`} note={`활성 항목 ${rows.length}개`} />
        </dl>
      </SummaryBox>

      <Card className="p-6">
        <h2 className="mb-4 text-sm font-semibold">
          이행 현황{" "}
          <span className="font-normal text-muted-foreground">
            (활성 항목 {rows.length}개 · 도래일은 마지막 실시일 + 법정 주기)
          </span>
        </h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            활성 항목이 없습니다 — [항목 관리]에서 켜거나{" "}
            <Link href="/modules/facilities/setup" className="font-medium text-blue-700 hover:underline">
              설정 마법사
            </Link>
            를 다시 실행하세요.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="w-52 shrink-0 font-medium">{r.name}</span>
                <span className="w-16 shrink-0 text-xs text-muted-foreground">
                  {cycleLabel({ type: r.cycleType, n: r.cycleN ?? undefined } as Cycle)}
                </span>
                <span className="w-40 shrink-0 font-mono text-xs text-muted-foreground">
                  {r.lastDoneAt ? `실시 ${ymdKst(r.lastDoneAt)}` : "실시일 없음"}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {r.vendor ?? ""}
                </span>
                {/* 날짜는 배경, D-day가 주인공 — 붙여 쓰면 D-day가 날짜에 묻힌다 */}
                <span className="w-24 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
                  {r.due ?? "—"}
                </span>
                <span
                  className={`w-20 shrink-0 text-right font-mono text-sm font-bold tabular-nums ${
                    r.left === null
                      ? "text-muted-foreground"
                      : r.left < 0
                        ? "text-red-600"
                        : r.status === "imminent"
                          ? "text-amber-600"
                          : "text-muted-foreground"
                  }`}
                >
                  {r.left === null ? "" : r.left < 0 ? `${-r.left}일 지남` : `D-${r.left}`}
                </span>
                <span
                  className={`w-24 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ${STATUS_PILL[r.status].cls}`}
                >
                  {STATUS_PILL[r.status].label}
                </span>
                <Button asChild size="sm" variant="outline" className="shrink-0">
                  <Link href={`/modules/facilities/new?item=${r.id}`}>기록</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-6">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">최근 기록</h2>
          <Link
            href="/modules/facilities/records"
            className="text-sm font-medium text-blue-700 hover:underline"
          >
            전체 기록 보기 →
          </Link>
        </div>
        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            아직 점검 기록이 없습니다 — 점검을 마쳤다면 [기록 작성]으로 남겨 주세요.
          </p>
        ) : (
          <ul className="divide-y">
            {docs.map((d) => {
              const m = (d.meta ?? {}) as {
                itemName?: string;
                doneAt?: string;
                result?: string;
              };
              return (
                <li key={d.id}>
                  <Link
                    href={`/modules/facilities/${d.id}`}
                    className="flex flex-wrap items-center gap-3 py-2 text-sm hover:bg-gray-50"
                  >
                    <span className="w-36 shrink-0 font-mono text-xs text-muted-foreground">
                      {d.docNo || (docStatusLabels[d.status] ?? d.status)}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {m.itemName ?? "-"}
                    </span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">
                      {m.doneAt ?? (d.dueDate ? ymdKst(d.dueDate) : ymdKst(d.createdAt))}
                    </span>
                    {m.result ? (
                      <span
                        className={`w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ${toneOf(m.result).pill}`}
                      >
                        {m.result}
                      </span>
                    ) : (
                      <span
                        className={`w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ${docStatusStyles[d.status] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {docStatusLabels[d.status] ?? d.status}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
