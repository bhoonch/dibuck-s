import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import {
  latestPerUnit,
  stageLabels,
  suggestStage,
  won,
  type DunningStage,
} from "@/lib/dunning";
import { ymdKst } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { SummaryBox, SummaryStat } from "@/components/ui/summary-box";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AttentionCard } from "@/components/attention-card";
import { DunningDocsTable } from "./dunning-docs-table";

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
    // ponytail: 전량 로드 후 JS 집계 — 회차가 월 1~2회라 수년치도 수천 행이다
    db.dunningEntry.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const open = latestPerUnit(entries).filter((e) => !e.paidAt);
  const total = open.reduce((s, e) => s + e.amount, 0);
  const stale = open.filter((e) => e.createdAt <= monthAgo());
  const perDoc = new Map<string, number>();
  for (const e of entries) perDoc.set(e.docId, (perDoc.get(e.docId) ?? 0) + 1);

  return (
    <>
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
      {/* 1차를 보낸 다음 걸음이 이 화면에 보여야 한다 — 세대별 현재 단계와
          다음에 나갈 문서를 표로 보여 주고, 그대로 채워진 마법사로 잇는다 */}
      {open.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">미납 중 세대 {open.length}</h2>
            <Button asChild variant="outline">
              <Link href="/modules/dunning/new?from=unpaid">
                다음 단계 독촉장 만들기
              </Link>
            </Button>
          </div>
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>세대</TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead>미납액</TableHead>
                  <TableHead>마지막 발송</TableHead>
                  <TableHead>다음 발송 시</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {open.map((e) => {
                  const next = suggestStage(e);
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">
                        {e.dong}동 {e.ho}호
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {e.name ?? "-"}
                      </TableCell>
                      <TableCell>{won(e.amount)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {e.stage}차 {stageLabels[e.stage as DunningStage]} ·{" "}
                        {ymdKst(e.createdAt)}
                        {e.createdAt <= monthAgo() && " (30일 지남)"}
                      </TableCell>
                      <TableCell>
                        {next}차 {stageLabels[next]}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
      <DunningDocsTable
        rows={docs.map((d) => ({
          id: d.id,
          docNo: d.docNo ?? "",
          title: d.title,
          count: perDoc.get(d.id) ?? 0,
          date: ymdKst(d.createdAt),
        }))}
      />
    </>
  );
}
