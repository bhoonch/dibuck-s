import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Stamp } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { ymdKst } from "@/lib/utils";
import { isRepeat, repairStats } from "@/lib/repairs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SummaryBox, SummaryStat } from "@/components/ui/summary-box";
import { AttentionCard } from "@/components/attention-card";
import {
  EquipmentHistoryPaper,
  type HistoryPaperRecord,
} from "@/components/equipment-history-paper";
import { PrintStyle } from "@/components/gian-paper";
import { PrintButton } from "./print-button";

type RepairMeta = {
  symptom?: string;
  action?: string;
  vendor?: string;
  cost?: number;
  startedAt?: string;
};

export default async function EquipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "repairs"))) redirect("/subscriptions");

  const { id } = await params;
  const [equipment, tenant, approvalsSubscribed] = await Promise.all([
    db.equipment.findFirst({ where: { id, tenantId } }),
    db.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { name: true },
    }),
    isSubscribed(tenantId, "approvals"),
  ]);
  if (!equipment) notFound();

  // 설비별 기록 — meta JSON 필터(findNoticeFor 선례). 단지 규모(연 수백 건)에 충분
  const docs = await db.document.findMany({
    where: {
      tenantId,
      type: "repair",
      status: { not: "void" },
      meta: { path: ["equipmentId"], equals: equipment.id },
    },
    select: { id: true, docNo: true, status: true, meta: true },
  });
  // 정렬은 meta.startedAt 역순 — createdAt은 이관 기록에서 실제 수선일과 다르다
  const records = docs
    .map((d) => {
      const m = (d.meta ?? {}) as RepairMeta;
      return {
        id: d.id,
        docNo: d.docNo,
        status: d.status,
        startedAt: m.startedAt ?? "",
        symptom: m.symptom ?? "",
        action: m.action ?? "",
        vendor: m.vendor ?? "",
        cost: m.cost ?? 0,
      };
    })
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));

  const today = ymdKst(new Date());
  const stat = repairStats(records, today);
  const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

  // 교체 품의의 사유 — 사실 서술만. 장충금 판정·결재선은 gian 규칙 엔진이 담당한다
  const whyText = `최근 12개월 수선 ${stat.count12m}회, 비용 누계 ${stat.cost12m.toLocaleString("ko-KR")}원. 전체 기간 ${stat.countAll}회, ${stat.costAll.toLocaleString("ko-KR")}원. 반복 수선으로 교체 검토가 필요함.`;

  const paperRecords: HistoryPaperRecord[] = records.map((r) => ({
    docNo: r.docNo,
    startedAt: r.startedAt,
    symptom: r.symptom,
    action: r.action,
    vendor: r.vendor,
    cost: r.cost,
    status: r.status,
  }));

  return (
    <div className="space-y-6">
      <PrintStyle />
      <Link
        href="/modules/repairs/equipment"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        설비 대장
      </Link>
      <PageHeader
        title={equipment.name}
        description={`${equipment.category}${equipment.location ? ` · ${equipment.location}` : ""}${equipment.active ? "" : " · 비활성"}`}
      >
        <PrintButton />
        {approvalsSubscribed && (
          <Button asChild size="lg">
            <Link
              href={`/modules/approvals/new?work=${encodeURIComponent(`${equipment.name} 교체`)}&why=${encodeURIComponent(whyText)}`}
            >
              <Stamp className="size-4" /> 교체 품의 만들기
            </Link>
          </Button>
        )}
      </PageHeader>

      {isRepeat(stat) && (
        <AttentionCard title="반복 고장 설비입니다">
          최근 12개월에 {stat.count12m}회 수선했습니다.
          <br />
          누계 수리비 {won(stat.cost12m)}을 교체 판단 자료로 쓰세요. [이력 카드
          인쇄]가 입대의 설득 자료가 됩니다.
        </AttentionCard>
      )}

      <SummaryBox>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryStat
            label="최근 12개월"
            value={`${stat.count12m}회`}
            note={`누계 ${won(stat.cost12m)}`}
          />
          <SummaryStat
            label="전체 기간"
            value={`${stat.countAll}회`}
            note={`누계 ${won(stat.costAll)}`}
          />
          <SummaryStat
            label="설치·교체 시점"
            value={equipment.installedAt ? ymdKst(equipment.installedAt) : "-"}
            note="연 단위 입력은 1월 1일"
          />
          <SummaryStat
            label="담당 업체"
            value={equipment.vendor ?? "-"}
            note={equipment.note ?? ""}
          />
        </dl>
      </SummaryBox>

      <Card className="p-6">
        <h2 className="mb-3 text-sm font-semibold">
          수선 타임라인{" "}
          <span className="font-normal text-muted-foreground">
            (최근 것부터)
          </span>
        </h2>
        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            아직 수선 기록이 없습니다. 수선이 생기면 [기록 작성]에서 이 설비를
            골라 주세요.
          </p>
        ) : (
          <ul className="divide-y">
            {records.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/modules/repairs/${r.id}`}
                  className="flex flex-wrap items-center gap-3 py-2 text-sm hover:bg-gray-50"
                >
                  <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">
                    {r.startedAt}
                  </span>
                  <span className="w-32 shrink-0 font-mono text-xs text-muted-foreground">
                    {r.docNo ?? "이관"}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {r.symptom}
                  </span>
                  {r.status === "open" && (
                    <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                      조치 중
                    </span>
                  )}
                  <span className="w-24 shrink-0 text-right font-mono text-xs tabular-nums">
                    {r.cost > 0 ? won(r.cost) : "-"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <EquipmentHistoryPaper
        office={`${tenant.name} 관리사무소`}
        equipment={{
          name: equipment.name,
          category: equipment.category,
          location: equipment.location ?? "",
          installedAt: equipment.installedAt
            ? ymdKst(equipment.installedAt)
            : "",
          vendor: equipment.vendor ?? "",
          active: equipment.active,
        }}
        stat={stat}
        records={paperRecords}
        printedAt={today}
      />
    </div>
  );
}
