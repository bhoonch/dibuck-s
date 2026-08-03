import { CheckCheck } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { ymdKst } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { markAllRead } from "./actions";
import { NotificationsTable } from "./notifications-table";

/* 빠른 확인은 헤더 종의 슬라이드 창 — 여기는 전체 이력을 문서함처럼 훑는 자리 */
export default async function NotificationsPage() {
  const session = await requireTenantSession();
  const notifications = await db.notification.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  const hasUnread = notifications.some((n) => !n.readAt);

  return (
    <>
      <PageHeader title="알림" description="놓치면 안 되는 소식을 모아뒀어요.">
        {hasUnread && (
          <form action={markAllRead}>
            <Button type="submit" variant="outline">
              <CheckCheck className="size-4" /> 모두 읽음으로 표시
            </Button>
          </form>
        )}
      </PageHeader>
      <NotificationsTable
        rows={notifications.map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body ?? "",
          link: n.link ?? "",
          read: !!n.readAt,
          date: ymdKst(n.createdAt),
        }))}
      />
    </>
  );
}
