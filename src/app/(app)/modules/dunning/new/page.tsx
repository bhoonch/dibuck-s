import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { PageHeader } from "@/components/ui/page-header";
import { DunningWizard } from "./dunning-wizard";

export default async function NewDunningPage() {
  const session = await requireSession();
  if (!(await isSubscribed(session.tenantId!, "dunning")))
    redirect("/subscriptions");
  const [tenant, lastDoc] = await Promise.all([
    db.tenant.findUniqueOrThrow({
      where: { id: session.tenantId! },
      select: { name: true, address: true, phone: true, sealImage: true, logoImage: true },
    }),
    // 납부 계좌는 매달 같다 — 지난 회차 값을 기본값으로
    db.document.findFirst({
      where: { tenantId: session.tenantId!, type: "dunning_letter" },
      orderBy: { createdAt: "desc" },
      select: { meta: true },
    }),
  ]);
  const last = (lastDoc?.meta ?? {}) as { account?: string };
  return (
    <>
      <PageHeader
        title="새 독촉장"
        description="미납 세대를 넣으면 단계에 맞는 문서가 세대별로 완성됩니다."
      />
      <DunningWizard
        office={`${tenant.name} 관리사무소`}
        address={tenant.address}
        tel={tenant.phone}
        sealImage={tenant.sealImage}
        logoImage={tenant.logoImage}
        defaultAccount={last.account ?? ""}
      />
    </>
  );
}
