import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { AccountSettings } from "@/components/account-settings";
import { PageHeader } from "@/components/ui/page-header";
import { roleLabels } from "@/lib/labels";
import { Role } from "@/generated/prisma/enums";

/**
 * 개인 설정은 단지 관리 서랍이 아니라 여기(/account) — 입구는 사이드바 하단
 * 프로필 칩 하나다. 단지 서랍의 나머지는 전부 단지의 것이고 이것만 개인의 것이라,
 * 직원이 자기 비밀번호를 바꾸러 단지 서랍을 뒤지게 하지 않는다.
 */
export default async function MyAccountPage() {
  const session = await requireTenantSession();
  const [me, tenant] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: session.userId },
      select: { name: true, title: true, email: true },
    }),
    // 탈퇴는 단지 전체를 지우는 일이라 마스터만. 임퍼서네이션 중에는 노출하지 않는다
    session.role === Role.DIRECTOR && !session.impersonating
      ? db.tenant.findUniqueOrThrow({
          where: { id: session.tenantId! },
          select: { name: true },
        })
      : null,
  ]);
  return (
    <div className="max-w-[720px]">
      <PageHeader
        title="내 계정"
        description="이름·직책과 비밀번호 등 내 정보를 관리합니다."
      />
      <AccountSettings
        name={me.name}
        title={me.title}
        email={me.email}
        roleLabel={roleLabels[session.role]}
        showTitle
        tenantName={tenant?.name}
      />
    </div>
  );
}
