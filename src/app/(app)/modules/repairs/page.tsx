import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePlus2, Wrench } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { ymdKst } from "@/lib/utils";
import { isRepeat, repairStats } from "@/lib/repairs";
import { docStatusLabels, docStatusStyles } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { SummaryBox, SummaryStat } from "@/components/ui/summary-box";
import { AttentionCard } from "@/components/attention-card";
import { GuideLink } from "@/components/guide-link";

type RepairMeta = {
  equipmentId?: string | null;
  equipmentName?: string | null;
  symptom?: string;
  cost?: number;
  startedAt?: string;
};

/** 수선 상태는 open/done — 화면에서는 "조치 중"으로 말한다(결재 어휘와 분리) */
const statusLabel = (s: string) =>
  s === "open" ? "조치 중" : (docStatusLabels[s] ?? s);

export default async function RepairsHomePage() {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "repairs"))) redirect("/subscriptions");

  const [equipment, docs] = await Promise.all([
    db.equipment.findMany({ where: { tenantId } }),
    db.document.findMany({
      where: { tenantId, type: "repair", status: { not: "void" } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        docNo: true,
        status: true,
        title: true,
        meta: true,
        createdAt: true,
      },
    }),
  ]);
  const records = docs.map((d) => ({
    ...d,
    m: (d.meta ?? {}) as RepairMeta,
  }));

  const today = ymdKst(new Date());
  const month = today.slice(0, 7); // 이번 달 KST
  const open = records.filter((r) => r.status === "open");
  const thisMonth = records.filter((r) => r.m.startedAt?.startsWith(month));
  const monthCost = thisMonth.reduce((a, r) => a + (r.m.cost ?? 0), 0);
  const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

  // 반복 고장 경고 — 열 때 계산(크론 없음). 비용 큰 설비부터
  const byEquip = new Map<string, { startedAt: string; cost: number }[]>();
  for (const r of records) {
    if (!r.m.equipmentId) continue;
    const list = byEquip.get(r.m.equipmentId) ?? [];
    list.push({ startedAt: r.m.startedAt ?? "", cost: r.m.cost ?? 0 });
    byEquip.set(r.m.equipmentId, list);
  }
  const repeaters = equipment
    .filter((e) => e.active)
    .map((e) => ({ e, stat: repairStats(byEquip.get(e.id) ?? [], today) }))
    .filter(({ stat }) => isRepeat(stat))
    .sort((a, b) => b.stat.cost12m - a.stat.cost12m);

  const empty = equipment.length === 0 && records.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="설비·수선 이력"
        description="30초 입력만으로 수선 이력과 비용 관리 완료! 인수인계 자료까지 자동으로 생성됩니다."
      >
        <GuideLink section="repairs" />
        <Button asChild variant="outline" size="lg">
          <Link href="/modules/repairs/equipment">
            <Wrench className="size-4" /> 설비 대장
          </Link>
        </Button>
        <Button asChild size="lg">
          <Link href="/modules/repairs/new">
            <FilePlus2 className="size-4" /> 기록 작성
          </Link>
        </Button>
      </PageHeader>

      {empty && (
        <Card className="p-6">
          <h2 className="text-sm font-semibold">시작하기</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            설비 대장을 먼저 올리면 수선이 설비별 이력으로 쌓입니다.
            <br />
            대장 없이 바로 기록부터 시작해도 됩니다. 과거 수첩의 이력도 [설비
            대장]에서 엑셀로 가져올 수 있습니다.
          </p>
        </Card>
      )}

      {repeaters.length > 0 && (
        <AttentionCard
          title={`반복 고장 설비가 ${repeaters.length}대 있습니다`}
        >
          {repeaters.map(({ e, stat }, i) => (
            <span key={e.id} className="block">
              <Link
                href={`/modules/repairs/equipment/${e.id}`}
                className="font-medium underline underline-offset-2"
              >
                {e.name}
              </Link>{" "}
              최근 12개월 {stat.count12m}회 · {won(stat.cost12m)}
              {/* 안내 문장은 마지막 줄에 붙인다 — 따로 떼면 설비 목록과 무관해 보인다 */}
              {i === repeaters.length - 1 &&
                " 설비 화면의 [이력 카드 인쇄]가 교체 설득 자료가 됩니다."}
            </span>
          ))}
        </AttentionCard>
      )}

      <SummaryBox>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryStat
            label="조치 중"
            value={`${open.length}건`}
            note={
              open.length > 0 ? "끝나면 완료 처리해 주세요" : "밀린 수선 없음"
            }
          />
          <SummaryStat
            label="이번 달"
            value={`${thisMonth.length}건`}
            note="발생일 기준"
          />
          <SummaryStat
            label="이번 달 비용"
            value={won(monthCost)}
            note="기록된 비용 합계"
          />
          <SummaryStat
            label="등록 설비"
            value={`${equipment.filter((e) => e.active).length}대`}
            note={`전체 ${equipment.length}대`}
          />
        </dl>
      </SummaryBox>

      {open.length > 0 && (
        <Card className="p-6">
          <h2 className="mb-3 text-sm font-semibold">조치 중인 수선</h2>
          <ul className="divide-y">
            {open.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/modules/repairs/${r.id}`}
                  className="flex flex-wrap items-center gap-3 py-2 text-sm hover:bg-gray-50"
                >
                  <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">
                    {r.m.startedAt ?? ymdKst(r.createdAt)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {r.title}
                  </span>
                  <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                    조치 중
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-6">
        <h2 className="mb-3 text-sm font-semibold">최근 기록</h2>
        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            아직 수선 기록이 없습니다. 첫 기록은 30초면 됩니다. [기록 작성]을
            눌러 보세요.
          </p>
        ) : (
          <ul className="divide-y">
            {records.slice(0, 10).map((r) => (
              <li key={r.id}>
                <Link
                  href={`/modules/repairs/${r.id}`}
                  className="flex flex-wrap items-center gap-3 py-2 text-sm hover:bg-gray-50"
                >
                  <span className="w-32 shrink-0 font-mono text-xs text-muted-foreground">
                    {r.docNo ?? "이관"}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {r.title}
                  </span>
                  <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">
                    {r.m.startedAt ?? ymdKst(r.createdAt)}
                  </span>
                  <span
                    className={`w-20 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium ${r.status === "open" ? "bg-red-50 text-red-700" : (docStatusStyles[r.status] ?? "bg-gray-100 text-gray-600")}`}
                  >
                    {statusLabel(r.status)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
