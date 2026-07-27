import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { roleLabels } from "@/lib/labels";
import { ApprovalLineEditor } from "./approval-line-editor";

export default async function ApprovalLinePage() {
  const session = await requireSession();
  const [tenant, staff] = await Promise.all([
    db.tenant.findUniqueOrThrow({ where: { id: session.tenantId! } }),
    db.user.findMany({
      where: { tenantId: session.tenantId! },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, title: true, role: true },
    }),
  ]);
  const line = (tenant.approvalLine as string[] | null) ?? [];
  const external =
    (tenant.externalApprovers as
      | {
          role: "CHAIR" | "AUDITOR" | "ETC";
          label?: string;
          name: string;
          phone?: string;
          email?: string;
        }[]
      | null) ?? [];

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
