import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { aiEnabled } from "@/lib/safety-training-ai";
import { ymdKst } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { TrainingForm } from "./training-form";

export default async function NewTrainingPage() {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "safety-training"))) redirect("/subscriptions");

  const [roster, director] = await Promise.all([
    db.trainingStaff.findMany({
      where: { tenantId, active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, position: true },
    }),
    // 강사 기본값 = 관리소장 — 현장 관행상 강사는 거의 항상 소장이다 (수정 가능)
    db.user.findFirst({
      where: { tenantId, role: "DIRECTOR" },
      select: { name: true, title: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-6xl">
      <Link
        href="/modules/safety-training"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        목록
      </Link>
      <PageHeader
        title="새 교육일지"
        description="종류와 주제만 골라도 됩니다 — 기본 정보는 채워져 있고, 교육 내용은 완성문이 만듭니다."
      />
      {!aiEnabled() && (
        <div className="mb-5 rounded-md bg-[var(--gian-warn-soft)] px-3.5 py-2.5 text-sm text-[var(--gian-warn)]">
          AI 문안 생성이 아직 활성화되지 않았습니다. 준비 후 이용할 수 있습니다.
        </div>
      )}
      <TrainingForm
        roster={roster}
        defaultDate={ymdKst(new Date())}
        defaultInstructor={
          director ? `${director.title ?? "관리소장"} ${director.name}` : ""
        }
        canManageStaff={session.role === "DIRECTOR" || session.role === "ACCOUNTANT"}
        aiReady={aiEnabled()}
      />
    </div>
  );
}
