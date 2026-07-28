import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { aiEnabled } from "@/lib/gian/claude";
import type { ExternalApprover } from "@/lib/gian/rules";
import { PageHeader } from "@/components/ui/page-header";
import { GianSteps } from "@/components/gian-steps";
import { GianForm } from "./gian-form";

export default async function NewGianPage() {
  const session = await requireSession();
  if (!(await isSubscribed(session.tenantId!, "approvals")))
    redirect("/settings/subscriptions");

  // 상신 때 뜰 결재선을 작성 중에 미리 보여준다 — submitDocument와 같은 재료
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: session.tenantId! },
    select: { approvalLine: true, externalApprovers: true },
  });
  const lineIds = (tenant.approvalLine as string[] | null) ?? [];
  const users = await db.user.findMany({
    where: { id: { in: lineIds } },
    select: { id: true, name: true },
  });
  const byId = new Map(users.map((u) => [u.id, u.name]));
  const internal = lineIds
    .filter((id) => byId.has(id))
    .map((id) => ({ userId: id, name: byId.get(id)! }));

  // 제목·단계표시·폼·판정을 문서 화면과 같은 기둥에 세운다 — 794(A4) + 288(패널).
  // 예전엔 여기만 620px 가운데 정렬이라 초안 확인에서 돌아올 때 화면이 옆으로 튀었다.
  return (
    <div className="mx-auto max-w-[794px] xl:max-w-[1108px]">
      <Link
        href="/modules/approvals"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        목록
      </Link>
      <PageHeader
        title="새 기안·품의"
        description="다섯 항목만 입력하면 법적 근거와 계약 방식까지 검토된 초안이 나옵니다."
      />
      <GianSteps current={1} />
      {!aiEnabled() && (
        <div className="mb-5 rounded-md bg-[var(--gian-warn-soft)] px-3.5 py-2.5 text-sm text-[var(--gian-warn)]">
          AI 초안 생성이 아직 활성화되지 않았습니다. 입력·판정은 확인할 수
          있지만 초안 생성은 준비 후 가능합니다.
        </div>
      )}
      <GianForm
        internal={internal}
        external={(tenant.externalApprovers as ExternalApprover[] | null) ?? []}
      />
    </div>
  );
}
