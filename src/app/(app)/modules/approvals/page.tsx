import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { ymdKst } from "@/lib/utils";
import { waitingOnLabel } from "@/lib/gian/rules";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { GianTable } from "./gian-table";

export default async function GianModulePage() {
  const session = await requireTenantSession();
  if (!(await isSubscribed(session.tenantId!, "approvals")))
    redirect("/subscriptions");

  const docs = await db.document.findMany({
    where: { tenantId: session.tenantId!, moduleId: "approvals" },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      docNo: true,
      type: true,
      title: true,
      status: true,
      meta: true, // sourceDocId — 파생 관계(품의→공고·보고·지출)를 잇는 유일한 끈
      createdAt: true,
      createdBy: { select: { name: true } },
      // 지금 결재 차례인 사람 — 목록에서 "누구에서 멈춰 있나"가 안 보였다
      approvalSteps: {
        where: { status: "pending" },
        select: { name: true, externalRole: true },
        take: 1,
      },
    },
  });

  /*
   * 원본 중심 목록 — 품의 행에는 파생 문서(공고→완료보고→지출결의) 진행 칩을,
   * 파생 행에는 원본 문서번호 역링크를 단다. "그 공사 건이 어디까지 갔나"를
   * 행 하나에서 보게 하기 위한 것으로, 건건이 찾아다니던 불편의 해법이다.
   */
  const sourceIdOf = (m: unknown) =>
    (m as { sourceDocId?: string } | null)?.sourceDocId ?? null;
  const inList = new Set(docs.map((d) => d.id));
  // 원본이 100건 창 밖으로 밀려난 파생 문서 — 역링크의 문서번호만 따로 채운다
  const missingIds = [
    ...new Set(
      docs
        .map((d) => sourceIdOf(d.meta))
        .filter((id): id is string => !!id && !inList.has(id)),
    ),
  ];
  const extraSources = missingIds.length
    ? await db.document.findMany({
        where: { id: { in: missingIds }, tenantId: session.tenantId! },
        select: { id: true, docNo: true },
      })
    : [];
  const docNoOf = new Map<string, string | null>([
    ...docs.map((d) => [d.id, d.docNo] as const),
    ...extraSources.map((d) => [d.id, d.docNo] as const),
  ]);

  const CHAIN: Record<string, string> = {
    notice: "공고문",
    report: "완료보고",
    expense: "지출결의",
  };
  const CHAIN_ORDER = Object.values(CHAIN);
  const linksOf = new Map<
    string,
    { id: string; label: string; status: string }[]
  >();
  for (const d of docs) {
    const sid = sourceIdOf(d.meta);
    if (!sid || d.status === "void" || !CHAIN[d.type]) continue;
    const list = linksOf.get(sid) ?? [];
    list.push({ id: d.id, label: CHAIN[d.type], status: d.status });
    linksOf.set(sid, list);
  }
  for (const list of linksOf.values())
    list.sort(
      (a, b) => CHAIN_ORDER.indexOf(a.label) - CHAIN_ORDER.indexOf(b.label),
    );

  return (
    <>
      <PageHeader
        title="AI 기안·결재"
        description="다섯 항목 입력으로 기안서·품의서 초안을 만들고 결재까지 진행합니다."
      >
        <Button asChild size="lg">
          <Link href="/modules/approvals/new">
            <FilePlus2 className="size-4" /> 새 기안·품의
          </Link>
        </Button>
      </PageHeader>

      {docs.length === 0 ? (
        <div className="mx-auto max-w-lg pt-10">
          <EmptyState
            icon={FilePlus2}
            title="아직 작성한 문서가 없습니다"
            description="공사·수리·용역 안건을 다섯 항목만 입력하면 결재란까지 갖춘 초안이 완성됩니다."
          >
            <Button asChild>
              <Link href="/modules/approvals/new">첫 문서 만들기</Link>
            </Button>
          </EmptyState>
        </div>
      ) : (
        <GianTable
          rows={docs.map((d) => {
            const sid = sourceIdOf(d.meta);
            return {
              id: d.id,
              docNo: d.docNo ?? "",
              title: d.title,
              type: d.type,
              status: d.status,
              waitingOn: waitingOnLabel(d.approvalSteps[0]),
              author: d.createdBy?.name ?? "-",
              createdAt: ymdKst(d.createdAt),
              source: sid ? { id: sid, docNo: docNoOf.get(sid) ?? "" } : null,
              links: linksOf.get(d.id) ?? [],
            };
          })}
        />
      )}
      {docs.length > 0 && (
        <p className="mt-2.5 text-xs text-muted-foreground">
          문서함 자동 저장 · 보존기한 5년 (공동주택관리법 시행령 — 관리 서류
          보존)
        </p>
      )}
    </>
  );
}
