import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Hammer } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

// 5단계에서 각 모듈이 자기 라우트를 구현하면 이 자리표시 페이지를 대체한다
export default async function ModulePlaceholderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireSession();
  const { id } = await params;
  const moduleData = await db.module.findUnique({ where: { id } });
  if (!moduleData) notFound();
  if (!(await isSubscribed(session.tenantId!, id)))
    redirect("/settings/subscriptions");

  return (
    <div className="mx-auto max-w-lg pt-10">
      <EmptyState
        icon={Hammer}
        title={`${moduleData.name} 모듈 준비 중`}
        description="곧 사용할 수 있어요. 준비되면 알림으로 알려드릴게요."
      >
        <Button asChild variant="outline">
          <Link href="/">홈으로</Link>
        </Button>
      </EmptyState>
    </div>
  );
}
