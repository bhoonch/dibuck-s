import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ymdKst } from "@/lib/utils";
import { parseExtTrainings } from "@/lib/safety-training";
import { StaffManager } from "./staff-manager";

export default async function TrainingStaffPage() {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "safety-training"))) redirect("/subscriptions");

  const staff = await db.trainingStaff.findMany({
    where: { tenantId },
    orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      position: true,
      hiredAt: true,
      active: true,
      supervisor: true,
      extTrainings: true,
    },
  });
  // 명부 관리는 마스터·매니저 — 세대 명부와 같은 경계
  const canManage =
    session.role === "DIRECTOR" || session.role === "ACCOUNTANT";

  return (
    <div className="mx-auto max-w-5xl">
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
      {/* 명부가 본문, 관리감독자 안내는 옆으로 뺀다 — 목록 사이에 두면 명부가 안 보인다 */}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <StaffManager
            staff={staff.map((s) => ({
              ...s,
              hiredAt: s.hiredAt ? ymdKst(s.hiredAt) : "",
              ext: parseExtTrainings(s.extTrainings),
            }))}
            canManage={canManage}
          />
        </div>
        {/* 편집할 수 있는 사람에게만 — 볼 수만 있는 계정에 "체크해 주세요"는 막다른 안내다 */}
        {canManage && (
          <aside className="xl:sticky xl:top-5">
            <Card className="p-5">
              <h2 className="mb-2 text-sm font-semibold">
                관리감독자(관리소장) 등록
              </h2>
              <p className="mb-3 text-xs text-muted-foreground">
                관리소장처럼 지휘·감독 위치에 있는 직원은 정기교육 기준이
                다릅니다 — 매반기 6·12시간이 아니라 <b>연간 16시간</b>입니다.
              </p>
              <ol className="mb-3 list-decimal space-y-1.5 pl-4 text-xs text-muted-foreground">
                <li>
                  해당 직원 줄에서 <b>[관리감독자]</b>를 체크하고 [저장]
                </li>
                <li>
                  저장하면 그 줄 아래에 <b>[외부 교육 이수]</b>가 열립니다
                </li>
                <li>
                  교육기관·본사 집합교육으로 받은 이수를 이수일·기관·시간으로
                  등록 — 연 16시간에 합산됩니다
                </li>
              </ol>
              <p className="text-xs text-muted-foreground">
                체크하면 반기 이수 현황 표에서 빠지고 연 단위로 따로 판정합니다.
                수료증 원본은 교육일지 철에 함께 보관하세요.
              </p>
            </Card>
          </aside>
        )}
      </div>
    </div>
  );
}
