import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { roleLabels } from "@/lib/labels";
import {
  ApprovalLineEditor,
  type ExternalApproverInput,
} from "./approval-line-editor";

export default async function ApprovalLinePage() {
  const session = await requireTenantSession();
  const [tenant, staff] = await Promise.all([
    db.tenant.findUniqueOrThrow({ where: { id: session.tenantId! } }),
    db.user.findMany({
      where: { tenantId: session.tenantId! },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, title: true, role: true },
    }),
  ]);
  const line = (tenant.approvalLine as string[] | null) ?? [];
  // 저장 모양 그대로 — token까지 실어 보내야 편집기가 결재함 링크를 그리고,
  // 저장할 때 그 값이 되돌아와 재발급되지 않는다
  const external =
    (tenant.externalApprovers as ExternalApproverInput[] | null) ?? [];

  return (
    <ApprovalLineEditor
      staff={staff.map((u) => ({
        id: u.id,
        name: u.name,
        label: u.title ?? roleLabels[u.role],
      }))}
      initialLine={line}
      initialExternal={external}
      isDirector={session.role === "DIRECTOR"}
    />
  );
}
