import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { Role } from "@/generated/prisma/enums";
import { AccountSettings } from "@/components/account-settings";
import { roleLabels } from "@/lib/labels";
import { PageTitle } from "../ui";

export default async function AdminAccountPage() {
  const session = await requireRole(Role.SUPER_ADMIN);
  const me = await db.user.findUniqueOrThrow({
    where: { id: session.userId },
    select: { name: true, title: true, email: true },
  });
  return (
    <>
      <PageTitle title="내 계정" description="운영자 계정 정보를 관리합니다." />
      <AccountSettings
        name={me.name}
        title={me.title}
        email={me.email}
        roleLabel={roleLabels[Role.SUPER_ADMIN]}
        showTitle={false}
      />
    </>
  );
}
