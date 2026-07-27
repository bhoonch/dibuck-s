import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { isSubscribed } from "@/lib/modules";
import { aiEnabled } from "@/lib/gian/claude";
import { PageHeader } from "@/components/ui/page-header";
import { GianForm } from "./gian-form";

export default async function NewGianPage() {
  const session = await requireSession();
  if (!(await isSubscribed(session.tenantId!, "approvals")))
    redirect("/settings/subscriptions");

  return (
    <>
      <PageHeader
        title="기안·품의 작성"
        description="입력 내용으로 S-APT 공용서식 기준 초안을 만듭니다."
      />
      {!aiEnabled() && (
        <div className="mb-4 max-w-2xl rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          AI 초안 생성이 아직 활성화되지 않았습니다. 입력·판정은 확인할 수
          있지만 초안 생성은 준비 후 가능합니다.
        </div>
      )}
      <GianForm />
    </>
  );
}
