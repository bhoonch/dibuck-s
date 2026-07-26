import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { StaffTable } from "./staff-table";

export default async function StaffPage() {
  const session = await requireSession();
  const staff = await db.user.findMany({
    where: { tenantId: session.tenantId! },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, title: true, email: true, role: true },
  });

  return (
    <StaffTable
      staff={staff}
      myUserId={session.userId}
      isDirector={session.role === "DIRECTOR"}
    />
  );
}
