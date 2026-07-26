import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getModulesForTenant } from "@/lib/modules";
import { pickAnnouncement } from "@/lib/announcements";
import { roleLabels } from "@/lib/labels";
import { SideNav } from "@/components/layout/side-nav";
import { AppHeader } from "@/components/layout/app-header";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  if (!session.tenantId) redirect("/admin"); // SUPER_ADMIN은 관리자 화면으로
  const tenantId = session.tenantId;
  const now = new Date();
  const days = (n: number) => new Date(now.getTime() + n * 86400000);

  const [tenant, modules, unread, announcements, docCount, expiring, complaints, me] =
    await Promise.all([
      db.tenant.findUnique({ where: { id: tenantId } }),
      getModulesForTenant(tenantId),
      db.notification.count({ where: { userId: session.userId, readAt: null } }),
      // 게시 기간 안에 있는 공지만 — 대상(전체/구독/미구독) 필터는 아래에서
      db.announcement.findMany({
        where: {
          active: true,
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      db.document.count({ where: { tenantId } }),
      db.document.count({
        where: { tenantId, type: "contract", dueDate: { gte: now, lte: days(30) } },
      }),
      db.document.count({ where: { tenantId, type: "complaint", status: "open" } }),
      db.user.findUnique({
        where: { id: session.userId },
        select: { title: true },
      }),
    ]);
  if (!tenant) redirect("/login");

  // 대상이 좁은 공지가 전체 공지를 이긴다 (src/lib/announcements.ts)
  const announcement = pickAnnouncement(announcements, {
    tenantId,
    subscribedModuleIds: modules.filter((m) => m.subscribed).map((m) => m.id),
    trialModuleIds: modules.filter((m) => m.trialEndsAt).map((m) => m.id),
  });

  // 사이드바 모듈별 미처리 뱃지 — 문서 컨벤션(type+status+dueDate)으로 집계
  const moduleBadges: Record<string, number> = {
    contracts: expiring,
    complaints,
  };

  const tenantMeta = [
    tenant.buildingInfo,
    tenant.households ? `${tenant.households.toLocaleString()}세대` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {announcement && (
        <div className="flex items-center justify-center gap-2 border-b border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          <Megaphone className="size-4 shrink-0" />
          {announcement.message}
        </div>
      )}
      <div className="flex min-h-dvh">
        <SideNav
          impersonating={!!session.impersonating}
          tenantName={tenant.name}
          tenantMeta={tenantMeta || "단지 정보를 입력해 주세요"}
          userName={session.name}
          userRole={me?.title ?? roleLabels[session.role]}
          docCount={docCount}
          modules={modules.map((m) => ({
            id: m.id,
            name: m.name,
            route: m.route,
            subscribed: m.subscribed,
            badge: moduleBadges[m.id],
          }))}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppHeader unread={unread} />
          <main className="w-full max-w-[1440px] flex-1 p-6">{children}</main>
        </div>
      </div>
    </>
  );
}
