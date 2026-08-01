import { redirect } from "next/navigation";
import { Role } from "@/generated/prisma/enums";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { latestPerUnit } from "@/lib/dunning";
import { isSubscribed } from "@/lib/modules";
import { PageHeader } from "@/components/ui/page-header";
import { DunningWizard } from "./dunning-wizard";

export default async function NewDunningPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  // 생성 액션과 같은 권한 — STAFF가 세 걸음 입력하고서야 튕기지 않게 여기서 먼저 막는다
  const session = await requireRole(Role.DIRECTOR, Role.ACCOUNTANT);
  if (!(await isSubscribed(session.tenantId!, "dunning")))
    redirect("/subscriptions");
  const { from } = await searchParams;
  const [tenant, lastDoc, entries] = await Promise.all([
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
    // 홈의 "다음 단계 발송" 경로(?from=unpaid) — 미납 중 세대를 다시 입력시키지
    // 않고 지난 발송 값으로 채워서 연다. 금액·기간은 1걸음에서 고칠 수 있다.
    from === "unpaid"
      ? db.dunningEntry.findMany({
          where: { tenantId: session.tenantId! },
          orderBy: { createdAt: "desc" },
          select: { dong: true, ho: true, name: true, amount: true, period: true, paidAt: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);
  const last = (lastDoc?.meta ?? {}) as { account?: string };
  const prefill = latestPerUnit(entries)
    .filter((e) => !e.paidAt)
    .map((e) => ({
      dong: e.dong,
      ho: e.ho,
      amount: String(e.amount),
      name: e.name ?? "",
      period: e.period ?? "",
    }));
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
        initialManual={prefill}
      />
    </>
  );
}
