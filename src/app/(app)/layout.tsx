import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, Hourglass, Megaphone } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getModulesForTenant } from "@/lib/modules";
import { pickAnnouncement } from "@/lib/announcements";
import { roleLabels } from "@/lib/labels";
import { graceDaysLeft } from "@/lib/tenant-deletion";
import { cancelTenantDeletion } from "@/app/account/actions";
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

  const [
    tenant,
    modules,
    unread,
    recentNotifications,
    announcements,
    docCount,
    expiring,
    complaints,
    me,
    billing,
  ] = await Promise.all([
      db.tenant.findUnique({ where: { id: tenantId } }),
      getModulesForTenant(tenantId),
      db.notification.count({ where: { userId: session.userId, readAt: null } }),
      // 헤더 종의 슬라이드 창에 실을 최근 알림 — 전체 이력은 /notifications
      db.notification.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, title: true, body: true, link: true, readAt: true, createdAt: true },
      }),
      // 게시 기간 안에 있는 공지만 — 대상(전체/구독/미구독) 필터는 아래에서
      db.announcement.findMany({
        where: {
          active: true,
          startsAt: { lte: now },
          OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        },
        // take 없음 — 최신순으로 먼저 자르면 좁은 대상 공지가 전체 공지에 묻힌다
        orderBy: { createdAt: "desc" },
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
      db.billing.findUnique({
        where: { tenantId },
        select: { status: true, billingKey: true },
      }),
    ]);
  // 이용 중지는 로그인만 막아선 부족하다 — 이미 로그인한 세션도 여기서 끊는다
  if (!tenant || tenant.status === "SUSPENDED") redirect("/login?error=suspended");

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

  // 체험 만료 안내 — 접속 시점에 계산해서 배너로 알린다(메일은 크론이 따로 보낸다).
  // 카드가 등록돼 있으면 만료가 잠금이 아니라 청구로 이어지므로 trialExpired가 뜨지 않는다.
  const expiredTrials = modules.filter((m) => m.trialExpired);
  const endingSoon = modules.filter(
    (m) => m.trialEndsAt && m.trialEndsAt.getTime() - now.getTime() <= 7 * 86400000,
  );
  const names = (list: typeof modules) => list.map((m) => m.name).join(", ");

  // 남은 일수에 따라 배너 강도를 올린다 — 30일 내내 같은 톤이면 아무도 안 읽는다
  const trialDaysLeft = endingSoon.length
    ? Math.max(
        1,
        Math.ceil(
          (Math.min(...endingSoon.map((m) => m.trialEndsAt!.getTime())) -
            now.getTime()) /
            86400000,
        ),
      )
    : 0;
  const trialTone =
    expiredTrials.length > 0 || trialDaysLeft <= 3
      ? "border-red-100 bg-red-50 text-red-700"
      : "border-amber-100 bg-amber-50 text-amber-800";

  // 결제 경고는 체험 안내보다 위 — 정지는 전 모듈이 잠긴 상태다
  const billingAlert =
    billing?.status === "SUSPENDED"
      ? "결제가 되지 않아 서비스가 일시 정지되었습니다. 데이터는 그대로 보관되어 있습니다."
      : billing?.status === "PAST_DUE"
        ? "결제에 실패했습니다. 카드를 확인해 주세요 — 유예 기간이 지나면 이용이 정지됩니다."
        : null;

  const tenantMeta = [
    tenant.buildingInfo,
    tenant.households ? `${tenant.households.toLocaleString()}세대` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {/* 탈퇴 유예 중이면 무엇보다 위에 — 30일 뒤 데이터가 사라진다 */}
      {tenant.deleteRequestedAt && (
        <div className="flex flex-wrap items-center justify-center gap-2 border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
          <AlertTriangle className="size-4 shrink-0" />
          탈퇴가 신청되었습니다 —{" "}
          <b>{graceDaysLeft(tenant.deleteRequestedAt, now)}일 뒤</b> 단지와 모든
          데이터가 삭제됩니다.{" "}
          {billing?.billingKey
            ? "새로 결제되지 않으며, 이미 결제한 기간이 끝나면 구독도 함께 해지됩니다."
            : "그때까지는 지금처럼 사용하실 수 있습니다."}
          {/* 취소는 마스터만 — 아니면 사실만 알린다 */}
          {session.role === "DIRECTOR" && !session.impersonating && (
            <form action={cancelTenantDeletion}>
              <button className="font-semibold underline underline-offset-2">
                탈퇴 취소하기
              </button>
            </form>
          )}
        </div>
      )}
      {announcement && (
        <div className="flex items-center justify-center gap-2 border-b border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          <Megaphone className="size-4 shrink-0" />
          {announcement.message}
          {announcement.linkUrl && (
            <Link
              href={announcement.linkUrl}
              className="font-semibold underline underline-offset-2"
            >
              {announcement.linkLabel || "자세히 보기"}
            </Link>
          )}
        </div>
      )}
      {billingAlert && (
        <div className="flex items-center justify-center gap-2 border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
          <AlertTriangle className="size-4 shrink-0" />
          {billingAlert}
          <Link
            href="/billing"
            className="font-semibold underline underline-offset-2"
          >
            결제 확인하기
          </Link>
        </div>
      )}
      {(expiredTrials.length > 0 || endingSoon.length > 0) && (
        <div
          className={`flex items-center justify-center gap-2 border-b px-4 py-2 text-sm ${trialTone}`}
        >
          <Hourglass className="size-4 shrink-0" />
          {expiredTrials.length > 0 ? (
            <>
              {names(expiredTrials)} 무료 체험이 종료되어 잠겼습니다.
              <Link
                href="/billing"
                className="font-semibold underline underline-offset-2"
              >
                카드 등록하고 계속 쓰기
              </Link>
            </>
          ) : (
            <>
              {names(endingSoon)} 무료 체험이 {trialDaysLeft}일 뒤 종료됩니다.
              <Link
                href="/billing"
                className="font-semibold underline underline-offset-2"
              >
                {trialDaysLeft <= 3 ? "지금 카드 등록하기" : "카드 등록"}
              </Link>
            </>
          )}
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
          <AppHeader
            unread={unread}
            notifications={recentNotifications.map((n) => ({
              id: n.id,
              title: n.title,
              body: n.body,
              link: n.link,
              read: !!n.readAt,
              createdAt: n.createdAt.toISOString(),
            }))}
          />
          <main className="w-full max-w-[1440px] flex-1 p-6 lg:px-10 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
