import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { aiEnabled } from "@/lib/notice-ai";
import { ymdKst } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { CopyRecent } from "@/components/copy-recent";
import { copyNoticePost } from "../actions";
import { NoticeForm } from "./notice-form";

export default async function NewNoticePage() {
  const session = await requireTenantSession();
  if (!(await isSubscribed(session.tenantId!, "notice")))
    redirect("/subscriptions");

  const [tenant, recent] = await Promise.all([
    db.tenant.findUniqueOrThrow({
      where: { id: session.tenantId! },
      select: { phone: true },
    }),
    // 복제 후보 — 반복 공지(단수·소독 등)는 재생성보다 복사가 빠르다. 폐기본 제외
    db.document.findMany({
      where: {
        tenantId: session.tenantId!,
        type: "notice",
        moduleId: "notice",
        status: { not: "void" },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, title: true, createdAt: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/modules/notice"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        목록
      </Link>
      <PageHeader
        title="새 공지문"
        description="유형을 고르고 아는 것만 적으면 됩니다. 비워 둔 항목은 완성문에서 빠지고, 확인이 필요한 것은 따로 알려드립니다."
      />
      {!aiEnabled() && (
        <div className="mb-5 rounded-md bg-[var(--gian-warn-soft)] px-3.5 py-2.5 text-sm text-[var(--gian-warn)]">
          AI 문안 생성이 아직 활성화되지 않았습니다. 준비 후 이용할 수 있습니다.
        </div>
      )}
      <CopyRecent
        title="지난 공지 복제"
        items={recent.map((d) => ({
          id: d.id,
          title: d.title,
          date: ymdKst(d.createdAt),
        }))}
        action={copyNoticePost}
      />
      <NoticeForm defaultContact={tenant.phone ?? ""} aiReady={aiEnabled()} />
    </div>
  );
}
