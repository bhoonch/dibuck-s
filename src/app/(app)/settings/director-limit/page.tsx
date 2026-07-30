import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { DirectorLimitEditor } from "./director-limit-editor";

export default async function DirectorLimitPage() {
  const session = await requireSession();
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: session.tenantId! },
    select: { directorLimit: true, directorLimitClause: true },
  });

  return (
    <DirectorLimitEditor
      initialLimit={tenant.directorLimit}
      initialClause={tenant.directorLimitClause}
      isDirector={session.role === "DIRECTOR"}
    />
  );
}
