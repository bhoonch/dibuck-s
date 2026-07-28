import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { assignableRoles, roleGuide, roleLabels } from "@/lib/labels";
import { Card } from "@/components/ui/card";
import { StaffTable } from "./staff-table";

export default async function StaffPage() {
  const session = await requireSession();
  const staff = await db.user.findMany({
    where: { tenantId: session.tenantId! },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, title: true, email: true, role: true },
  });

  return (
    <div className="space-y-6">
      {/* 권한을 고르는 자리 바로 위에서 "뭘 고르는 건지"를 먼저 읽게 한다 */}
      <div>
        <h2 className="mb-3 text-lg font-semibold tracking-tight">권한 안내</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {assignableRoles.map((r) => (
            <Card key={r} className="gap-1.5 p-4">
              <p className="font-semibold">{roleLabels[r]}</p>
              <p className="text-sm text-muted-foreground">{roleGuide[r]}</p>
            </Card>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          권한은 시스템에서 할 수 있는 일을, 직책(관리소장·경비반장 등)은 문서에
          찍히는 이름을 정합니다. 서로 무관합니다.
        </p>
      </div>

      <StaffTable
        staff={staff}
        myUserId={session.userId}
        isDirector={session.role === "DIRECTOR"}
      />
    </div>
  );
}
