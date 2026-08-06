import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { ymdKst } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { PrintStyle } from "@/components/gian-paper";
import { PaperScale } from "@/components/paper-scale";
import { InspectionPaper } from "@/components/inspection-paper";
import { PrintButton } from "../print-button";

/**
 * 항목별 연간 일괄 출력 — 감사·지도점검의 실제 요구가 "이 분야의 일정 기간치를
 * 묶어서 내라"여서(놀이시설 실시대장 최근분, 소방 관련 일체 등), 일지를 한 건씩
 * 여는 대신 이 화면에서 한 번에 인쇄한다. 서류철 매트릭스의 항목명이 입구다.
 */
export default async function BatchPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ itemId: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "facilities"))) redirect("/subscriptions");
  const { itemId } = await params;
  const { year: yearParam } = await searchParams;
  const thisYear = Number(ymdKst(new Date()).slice(0, 4));
  const year = /^\d{4}$/.test(yearParam ?? "") ? Number(yearParam) : thisYear;

  const [item, records, tenant] = await Promise.all([
    db.inspectionItem.findFirst({ where: { id: itemId, tenantId } }),
    db.document.findMany({
      where: {
        tenantId,
        type: "inspection",
        status: "final",
        meta: { path: ["itemId"], equals: itemId },
      },
      include: {
        createdBy: { select: { name: true } },
        attachmentFiles: { orderBy: { createdAt: "asc" }, select: { name: true } },
      },
    }),
    db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } }),
  ]);
  if (!item) notFound();

  type Meta = {
    itemName?: string;
    legalBasis?: string;
    doneAt?: string;
    performedBy?: string;
    result?: string;
    units?: { name: string; result: string }[];
    barrier?: boolean;
    scope?: string;
    findings?: string;
    actions?: string;
    cost?: number;
  };
  const sheets = records
    .map((d) => ({ d, m: (d.meta ?? {}) as Meta }))
    .filter(({ d, m }) => (m.doneAt ?? ymdKst(d.createdAt)).startsWith(`${year}-`))
    .sort((a, b) =>
      (a.m.doneAt ?? "").localeCompare(b.m.doneAt ?? ""),
    );
  const office = `${tenant.name} 관리사무소장`;

  return (
    <>
      <PrintStyle target="batch-sheets" />
      <div className="mx-auto max-w-[794px] space-y-6">
        <Link
          href={`/modules/facilities/binder?year=${year}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden"
        >
          <ChevronLeft className="size-4" /> 감사 서류철
        </Link>
        <div className="print:hidden">
          <PageHeader
            title={`${item.name} — ${year}년 일지 일괄 출력`}
            description={`완료 기록 ${sheets.length}건이 실시일 순으로 한 장씩 인쇄됩니다. 첨부 성적서·필증은 각 일지 화면에서 따로 내려받습니다.`}
          >
            {sheets.length > 0 && <PrintButton />}
          </PageHeader>
        </div>

        {sheets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {year}년 완료 기록이 없습니다.
          </p>
        ) : (
          <div id="batch-sheets" className="space-y-6 print:space-y-0">
            {sheets.map(({ d, m }, i) => (
              <div key={d.id} className={i < sheets.length - 1 ? "print:break-after-page" : ""}>
                <PaperScale>
                  <InspectionPaper
                    id={`sheet-${d.id}`}
                    data={{
                      docNo: d.docNo ?? "-",
                      itemName: m.itemName ?? item.name,
                      legalBasis: m.legalBasis ?? item.legalBasis,
                      doneAt: m.doneAt ?? ymdKst(d.createdAt),
                      performedBy: m.performedBy ?? "자체",
                      result: m.result ?? "정상",
                      units: m.units ?? [],
                      barrier: m.barrier ?? false,
                      scope: m.scope ?? "",
                      findings: m.findings ?? "",
                      actions: m.actions ?? "",
                      cost: m.cost ?? 0,
                      attachmentNames: d.attachmentFiles.map((f) => f.name),
                      author: d.createdBy?.name ?? "",
                      office,
                    }}
                  />
                </PaperScale>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
