import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { ymdKst } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { InspectionTable } from "../inspection-table";

/** 전체 기록 — 검색·정렬 테이블. 현황판에서 분리했다(현황판은 "지금 할 일"만) */
export default async function InspectionRecordsPage() {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "facilities"))) redirect("/subscriptions");

  const docs = await db.document.findMany({
    where: { tenantId, type: "inspection" },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      docNo: true,
      title: true,
      status: true,
      meta: true,
      dueDate: true,
      createdAt: true,
      createdBy: { select: { name: true } },
    },
  });

  return (
    <div className="space-y-6">
      <Link
        href="/modules/facilities"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> 현황판
      </Link>
      <PageHeader
        title="점검 기록 전체"
        description="작업지시·조치·폐기본을 포함한 전체 목록입니다. 감사 제출용 묶음은 [감사 서류철]에서 항목별로 한 번에 인쇄할 수 있습니다."
      />
      <InspectionTable
        rows={docs.map((d) => {
          const m = (d.meta ?? {}) as {
            itemName?: string;
            doneAt?: string;
            result?: string;
          };
          return {
            id: d.id,
            docNo: d.docNo ?? "",
            title: d.title,
            itemName: m.itemName ?? "-",
            doneAt: m.doneAt ?? (d.dueDate ? ymdKst(d.dueDate) : ymdKst(d.createdAt)),
            result: m.result ?? "",
            status: d.status,
            author: d.createdBy?.name ?? "",
          };
        })}
      />
    </div>
  );
}
