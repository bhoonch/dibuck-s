import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { Role } from "@/generated/prisma/enums";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { SetupWizard } from "./setup-wizard";

export default async function InspectionSetupPage() {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "facilities"))) redirect("/subscriptions");

  const existing = await db.inspectionItem.findMany({
    where: { tenantId },
    select: { presetKey: true },
  });
  const canManage =
    session.role === Role.DIRECTOR || session.role === Role.ACCOUNTANT;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/modules/facilities"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" /> 현황판
      </Link>
      <PageHeader
        title="점검 항목 설정"
        description="단지 시설을 몇 가지만 답하면 해당하는 법정점검 항목이 자동으로 켜집니다. 법정 주기는 몰라도 됩니다 — 주기는 앱이 셉니다."
      />
      {canManage ? (
        <SetupWizard
          existingKeys={existing.map((e) => e.presetKey).filter(Boolean) as string[]}
        />
      ) : (
        <Card className="p-6 text-sm text-muted-foreground">
          점검 항목 설정은 마스터·매니저가 합니다 — 설정이 끝나면 현황판에서
          전 항목의 도래일을 볼 수 있습니다.
        </Card>
      )}
    </div>
  );
}
