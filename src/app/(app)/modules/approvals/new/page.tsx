import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { isSubscribed } from "@/lib/modules";
import { aiEnabled } from "@/lib/gian/claude";
import { PageHeader } from "@/components/ui/page-header";
import { GianSteps } from "@/components/gian-steps";
import { GianForm } from "./gian-form";

export default async function NewGianPage() {
  const session = await requireSession();
  if (!(await isSubscribed(session.tenantId!, "approvals")))
    redirect("/settings/subscriptions");

  // 제목·단계표시·폼을 한 기둥(620px)에 세운다 — 폼만 가운데면 축이 둘로 갈린다
  return (
    <div className="mx-auto max-w-[620px]">
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
      <GianForm />
    </div>
  );
}
