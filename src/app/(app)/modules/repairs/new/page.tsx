import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { ymdKst } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { RepairForm } from "./repair-form";

export default async function NewRepairPage({
  searchParams,
}: {
  searchParams: Promise<{ symptom?: string; vendor?: string }>;
}) {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "repairs"))) redirect("/subscriptions");

  const [equipment, sp] = await Promise.all([
    db.equipment.findMany({
      where: { tenantId, active: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { id: true, name: true, category: true, vendor: true },
    }),
    searchParams,
  ]);

  return (
    <div className="mx-auto max-w-xl">
      <Link
        href="/modules/repairs"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        목록
      </Link>
      <PageHeader
        title="수선 기록"
        description="설비를 고르고 증상만 적으면 됩니다. 저장하면 바로 문서번호가 붙습니다."
      />
      <RepairForm
        equipment={equipment.map((e) => ({
          id: e.id,
          name: e.name,
          category: e.category,
          vendor: e.vendor ?? "",
        }))}
        today={ymdKst(new Date())}
        defaultSymptom={String(sp.symptom ?? "").slice(0, 200)}
        defaultVendor={String(sp.vendor ?? "").slice(0, 100)}
      />
    </div>
  );
}
