import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { PageHeader } from "@/components/ui/page-header";
import { StaffManager } from "./staff-manager";

export default async function TrainingStaffPage() {
  const session = await requireSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "safety-training"))) redirect("/subscriptions");

  const staff = await db.trainingStaff.findMany({
    where: { tenantId },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    select: { id: true, name: true, position: true, office: true, active: true },
  });
  // 명부 관리는 마스터·매니저 — 세대 명부와 같은 경계
  const canManage =
    session.role === "DIRECTOR" || session.role === "ACCOUNTANT";

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/modules/safety-training"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        목록
      </Link>
      <PageHeader
        title="직원 명부"
        description="교육 대상 직원을 한 번 등록해 두면 일지마다 체크만 하면 됩니다. 완성된 일지의 명단은 그 시점 스냅샷이라 여기를 고쳐도 변하지 않습니다."
      />
      <StaffManager staff={staff} canManage={canManage} />
    </div>
  );
}
