import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { won } from "@/lib/dunning";
import { ymdKst } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { SummaryBox, SummaryStat } from "@/components/ui/summary-box";
import { Button } from "@/components/ui/button";
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

  // (동,호)별 최신 발송 = 그 세대의 현재 상태 (desc라 처음 만난 것이 최신)
  const latest = new Map<string, (typeof entries)[number]>();
  for (const e of entries) {
    const k = `${e.dong}/${e.ho}`;
    if (!latest.has(k)) latest.set(k, e);
  }
  const open = [...latest.values()].filter((e) => !e.paidAt);
  const total = open.reduce((s, e) => s + e.amount, 0);
  const stale = open.filter((e) => e.createdAt <= monthAgo());
  const perDoc = new Map<string, number>();
  for (const e of entries) perDoc.set(e.docId, (perDoc.get(e.docId) ?? 0) + 1);

  return (
    <>
      <PageHeader title="미납 독촉장" description="미납 세대 독촉 문서를 한 번에 만들고 이력을 관리합니다.">
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
          action={<Button asChild variant="outline"><Link href="/modules/dunning/new">다음 단계 발송</Link></Button>}
        >
          마지막 발송 후 30일이 지났는데 납부 확인이 없는 세대입니다:{" "}
          {stale.slice(0, 8).map((e) => `${e.dong}동 ${e.ho}호`).join(", ")}
          {stale.length > 8 && ` 외 ${stale.length - 8}세대`}
        </AttentionCard>
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
