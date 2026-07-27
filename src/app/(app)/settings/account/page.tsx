import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { AccountSettings } from "@/components/account-settings";
import { Role } from "@/generated/prisma/enums";

export default async function MyAccountPage() {
  const session = await requireSession();
  const [me, tenant] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: session.userId },
      select: { name: true, title: true, email: true },
    }),
    // 탈퇴는 단지 전체를 지우는 일이라 소장만. 임퍼서네이션 중에는 노출하지 않는다
    session.role === Role.DIRECTOR && !session.impersonating
      ? db.tenant.findUniqueOrThrow({
          where: { id: session.tenantId! },
          select: { name: true },
        })
      : null,
  ]);
  return (
    <AccountSettings
      name={me.name}
      title={me.title}
      email={me.email}
      showTitle
      tenantName={tenant?.name}
    />
  );
}
