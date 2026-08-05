import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { ymdKst } from "@/lib/utils";
import { cycleLabel, type Cycle } from "@/lib/inspection/catalog";
import { daysUntil, nextDue, statusOf } from "@/lib/inspection/schedule";
import { STATUS_RANK } from "@/lib/inspection/status";
import { PageHeader } from "@/components/ui/page-header";
import { RecordForm } from "./record-form";

export default async function NewInspectionRecordPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>;
}) {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "facilities"))) redirect("/subscriptions");
  const { item } = await searchParams;

  const [items, tenant] = await Promise.all([
    db.inspectionItem.findMany({
      where: { tenantId, active: true },
      orderBy: { createdAt: "asc" },
    }),
    db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { name: true } }),
  ]);
  if (items.length === 0) redirect("/modules/facilities/setup");

  // 1단계 카드는 급한 항목부터 — 현황판과 같은 정렬(지연→임박→기준일 필요→정상)
  const now = new Date();
  const rows = items
    .map((it) => {
      const due = nextDue(it);
      const status = statusOf(it, now);
      return {
        id: it.id,
        name: it.name,
        legalBasis: it.legalBasis,
        vendor: it.vendor ?? "",
        lastDoneAt: it.lastDoneAt ? ymdKst(it.lastDoneAt) : "",
        cycle: cycleLabel({ type: it.cycleType, n: it.cycleN ?? undefined } as Cycle),
        status,
        left: due ? daysUntil(due, now) : null,
      };
    })
    .sort(
      (a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
        (a.left ?? 0) - (b.left ?? 0),
    );

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        href="/modules/facilities"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> 현황판
      </Link>
      <PageHeader
        title="점검 기록 작성"
        description="어떤 점검을 하셨나요? 항목을 고르면 입력하는 대로 A4 점검일지가 미리 채워집니다."
      />
      <RecordForm
        items={rows}
        preselect={item}
        today={ymdKst(now)}
        office={`${tenant.name} 관리사무소장`}
        author={session.name}
      />
    </div>
  );
}
