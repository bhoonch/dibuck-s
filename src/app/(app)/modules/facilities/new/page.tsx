import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { ymdKst } from "@/lib/utils";
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

  const items = await db.inspectionItem.findMany({
    where: { tenantId, active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, vendor: true, lastDoneAt: true },
  });
  if (items.length === 0) redirect("/modules/facilities/setup");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/modules/facilities"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> 현황판
      </Link>
      <PageHeader
        title="점검 기록 작성"
        description="저장하면 문서번호가 부여되고 A4 점검일지가 만들어집니다 — 다음 도래일은 자동으로 이동합니다."
      />
      <RecordForm
        items={items.map((it) => ({
          id: it.id,
          name: it.name,
          vendor: it.vendor ?? "",
          lastDoneAt: it.lastDoneAt ? ymdKst(it.lastDoneAt) : "",
        }))}
        preselect={item}
        today={ymdKst(new Date())}
      />
    </div>
  );
}
