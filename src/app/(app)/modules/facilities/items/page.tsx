import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { Role } from "@/generated/prisma/enums";
import { ymdKst } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { ItemsManager } from "./items-manager";

export default async function InspectionItemsPage() {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "facilities"))) redirect("/subscriptions");

  const items = await db.inspectionItem.findMany({
    where: { tenantId },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
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
        title="점검 항목 관리"
        description="업체·리드타임·기준일을 고치고, 해당 없는 항목은 끕니다. 법정 주기·근거는 법이 정한 값이라 고칠 수 없습니다."
      >
        <Button asChild variant="outline" size="lg">
          <Link href="/modules/facilities/setup">설정 마법사 다시 실행</Link>
        </Button>
      </PageHeader>
      <ItemsManager
        items={items.map((it) => ({
          id: it.id,
          name: it.name,
          legalBasis: it.legalBasis,
          cycleType: it.cycleType,
          cycleN: it.cycleN,
          leadDays: it.leadDays,
          lastDoneAt: it.lastDoneAt ? ymdKst(it.lastDoneAt) : "",
          vendor: it.vendor ?? "",
          active: it.active,
          preset: !!it.presetKey,
        }))}
        canManage={
          session.role === Role.DIRECTOR || session.role === Role.ACCOUNTANT
        }
      />
    </div>
  );
}
