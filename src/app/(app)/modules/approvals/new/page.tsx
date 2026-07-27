import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { isSubscribed } from "@/lib/modules";
import { aiEnabled } from "@/lib/gian/claude";
import { GianSteps } from "@/components/gian-steps";
import { GianForm } from "./gian-form";

export default async function NewGianPage() {
  const session = await requireSession();
  if (!(await isSubscribed(session.tenantId!, "approvals")))
    redirect("/settings/subscriptions");

  return (
    <>
      {/* 페이지 제목은 폼 카드 안의 "어떤 문서를 올릴까요?"가 대신한다 (목업 구성) */}
      <GianSteps current={1} />
      {!aiEnabled() && (
        <div className="mx-auto mb-4 max-w-[620px] rounded-md bg-[var(--gian-warn-soft)] px-3.5 py-[11px] text-[13.5px] text-[var(--gian-warn)]">
          AI 초안 생성이 아직 활성화되지 않았습니다. 입력·판정은 확인할 수
          있지만 초안 생성은 준비 후 가능합니다.
        </div>
      )}
      <GianForm />
    </>
  );
}
