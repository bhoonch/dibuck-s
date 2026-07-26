import Link from "next/link";
import { BellOff, CheckCheck } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { markAllRead } from "./actions";

export default async function NotificationsPage() {
  const session = await requireSession();
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
      {notifications.length === 0 ? (
        <EmptyState icon={BellOff} title="아직 알림이 없습니다" />
      ) : (
        <ul className="max-w-2xl space-y-2">
          {notifications.map((n) => {
            const body = (
              <div
                className={cn(
                  "rounded-xl border bg-card p-4 transition-colors",
                  n.link && "hover:border-primary",
                  !n.readAt && "border-l-4 border-l-primary",
                )}
              >
                <p className={cn("font-medium", n.readAt && "text-muted-foreground")}>
                  {n.title}
                </p>
                {n.body && (
                  <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {n.createdAt.toLocaleDateString("ko-KR", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
            );
            return (
              <li key={n.id}>
                {n.link ? <Link href={n.link}>{body}</Link> : body}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
