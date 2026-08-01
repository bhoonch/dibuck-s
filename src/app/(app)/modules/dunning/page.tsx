import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import {
  latestPerUnit,
  suggestStage,
  won,
  type DunningStage,
} from "@/lib/dunning";
import { ymdKst } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { SummaryBox, SummaryStat } from "@/components/ui/summary-box";
import { Button } from "@/components/ui/button";
import { AttentionCard } from "@/components/attention-card";
import { DunningDocsTable } from "./dunning-docs-table";
import { UnpaidTable } from "./unpaid-table";

/** 재발송 검토 기준 — 마지막 발송 후 30일 */
const monthAgo = () => new Date(Date.now() - 30 * 86400000);

export default async function DunningHomePage() {
  const session = await requireSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "dunning"))) redirect("/subscriptions");

  const [docs, entries] = await Promise.all([
    db.document.findMany({
      where: { tenantId, type: "dunning_letter", status: { not: "void" } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, docNo: true, title: true, createdAt: true },
    }),
    // ponytail: 전량 로드 후 JS 집계 — 회차가 월 1~2회라 수년치도 수천 행이다.
    // 폐기된 회차의 발송은 없던 일 — 집계·단계 판정에 세지 않는다.
    db.dunningEntry.findMany({
      where: { tenantId, document: { status: "final" } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const open = latestPerUnit(entries).filter((e) => !e.paidAt);
  const total = open.reduce((s, e) => s + e.amount, 0);
  const stale = open.filter((e) => e.createdAt <= monthAgo());
  // 회차별 세대수·단계 구성·검색용 세대 나열
  const perDoc = new Map<
    string,
    { count: number; stages: Map<number, number>; units: string[] }
  >();
  for (const e of entries) {
    const d = perDoc.get(e.docId) ?? {
      count: 0,
      stages: new Map<number, number>(),
      units: [] as string[],
    };
    d.count++;
    d.stages.set(e.stage, (d.stages.get(e.stage) ?? 0) + 1);
    d.units.push(`${e.dong}동 ${e.ho}호${e.name ? ` ${e.name}` : ""}`);
    perDoc.set(e.docId, d);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="미납 독촉장"
        description="1차 납부 안내 → 2차 납부 최고 → 3차 내용증명 순으로 문서를 만들어 보냅니다. 발송 후에도 미납이면 다음 단계가 자동 제안됩니다."
      >
        <Button asChild size="lg">
          <Link href="/modules/dunning/new"><FilePlus2 className="size-4" /> 새 독촉장</Link>
        </Button>
      </PageHeader>
      {docs.length > 0 && (
        <SummaryBox>
          <SummaryStat label="미납 세대" value={`${open.length}세대`} />
          <SummaryStat label="미납 총액" value={won(total)} />
          <SummaryStat
            label="단계별"
            value={[1, 2, 3]
              .map((s) => `${s}차 ${open.filter((e) => e.stage === s).length}`)
              .join(" · ")}
            note="세대별 최신 발송 기준"
          />
        </SummaryBox>
      )}
      {stale.length > 0 && (
        <AttentionCard
          title={`재발송 검토 대상 ${stale.length}세대`}
          action={
            <Button asChild variant="outline">
              {/* 빈 마법사가 아니라 미납 세대를 채워서 연다 — 다시 입력시키지 않는다 */}
              <Link href="/modules/dunning/new?from=unpaid">다음 단계 발송</Link>
            </Button>
          }
        >
          마지막 발송 후 30일이 지났는데 납부 확인이 없는 세대입니다:{" "}
          {stale.slice(0, 8).map((e) => `${e.dong}동 ${e.ho}호`).join(", ")}
          {stale.length > 8 && ` 외 ${stale.length - 8}세대`}
        </AttentionCard>
      )}
      {open.length > 0 && (
        <UnpaidTable
          rows={open.map((e) => ({
            id: e.id,
            dong: e.dong,
            ho: e.ho,
            name: e.name,
            amount: e.amount,
            stage: e.stage as DunningStage,
            next: suggestStage(e),
            lastSent: ymdKst(e.createdAt),
            stale: e.createdAt <= monthAgo(),
          }))}
        />
      )}
      <DunningDocsTable
        rows={docs.map((d) => {
          const info = perDoc.get(d.id);
          return {
            id: d.id,
            docNo: d.docNo ?? "",
            title: d.title,
            units: info?.units.join(", ") ?? "",
            stages: [1, 2, 3]
              .filter((s) => info?.stages.get(s))
              .map((s) => `${s}차 ${info!.stages.get(s)}`)
              .join(" · "),
            count: info?.count ?? 0,
            date: ymdKst(d.createdAt),
          };
        })}
      />
    </div>
  );
}
