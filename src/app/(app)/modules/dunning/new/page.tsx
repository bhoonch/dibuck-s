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
  searchParams: Promise<{ from?: string; units?: string }>;
}) {
  // 생성 액션과 같은 권한 — STAFF가 세 걸음 입력하고서야 튕기지 않게 여기서 먼저 막는다
  const session = await requireRole(Role.DIRECTOR, Role.ACCOUNTANT);
  if (!(await isSubscribed(session.tenantId!, "dunning")))
    redirect("/subscriptions");
  const { from, units } = await searchParams;
  // 홈에서 체크한 세대만 담는 경로(?units=101_502,…) — from=unpaid는 전체
  const wanted = units
    ? new Set(units.split(",").map((u) => u.trim()))
    : null;
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
    // 홈의 "다음 단계 발송" 경로 — 미납 중 세대를 다시 입력시키지 않고
    // 지난 발송 값으로 채워서 연다. 금액·기간은 1걸음에서 고칠 수 있다.
    from === "unpaid" || wanted
      ? db.dunningEntry.findMany({
          // 폐기된 회차의 발송은 없던 일
          where: { tenantId: session.tenantId!, document: { status: "final" } },
          orderBy: { createdAt: "desc" },
          select: { dong: true, ho: true, name: true, amount: true, period: true, paidAt: true, legalAt: true, createdAt: true },
        })
      : Promise.resolve([]),
  ]);
  const last = (lastDoc?.meta ?? {}) as { account?: string };
  const prefill = latestPerUnit(entries)
    // 법적 절차 세대는 발송 대상이 아니다
    .filter((e) => !e.paidAt && !e.legalAt)
    .filter((e) => !wanted || wanted.has(`${e.dong}_${e.ho}`))
    .map((e) => ({
      dong: e.dong,
      ho: e.ho,
      // 입력창과 같은 표기 — 천 단위 콤마
      amount: e.amount.toLocaleString("ko-KR"),
      name: e.name ?? "",
      period: e.period ?? "",
    }));
  // 홈에서 세대를 담아 온 경우 — "새 독촉장"과 같은 화면이지만 처음부터가 아니라
  // 이어서 하는 걸음이라는 걸 머리글이 말해 줘야 한다(사용자 피드백)
  const nextMode = prefill.length > 0;
  return (
    <>
      <PageHeader
        title={nextMode ? "다음 단계 독촉장" : "새 독촉장"}
        description={
          nextMode
            ? `미납 중 세대 ${prefill.length}곳을 지난 발송 내용으로 불러왔습니다. 금액·기간만 확인하면 다음 단계 문서가 완성됩니다.`
            : "미납 세대를 넣으면 단계에 맞는 문서가 세대별로 완성됩니다."
        }
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
