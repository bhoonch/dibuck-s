import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { aiEnabled } from "@/lib/minutes-ai";
import type { MeetingMeta } from "@/lib/minutes";
import { PageHeader } from "@/components/ui/page-header";
import { MinutesEditor } from "./minutes-editor";

const MODULE_ID = "minutes";
const TYPE = "minutes";

/**
 * 회의록 작성·수정 화면 — 완성 전(draft)만. 완성 후에는 불변 원칙(서명 시작 후
 * 수정 불가와 같은 결)에 따라 이 화면 자체를 열지 못하게 문서 화면으로 돌려보낸다.
 */
export default async function MinutesEditPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, MODULE_ID))) redirect("/subscriptions");
  const { docId } = await params;
  const doc = await db.document.findFirst({
    where: { id: docId, tenantId, type: TYPE, moduleId: MODULE_ID },
  });
  if (!doc) notFound();
  if (doc.status !== "draft") redirect(`/modules/minutes/${docId}`);

  const meta = doc.meta as MeetingMeta;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={`/modules/minutes/${docId}`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        돌아가기
      </Link>
      <PageHeader
        title="회의록 작성"
        description="메모를 붙여넣어 AI로 정리하거나, 안건별로 직접 채울 수 있습니다."
      />
      <MinutesEditor
        docId={doc.id}
        agenda={meta.agenda}
        initialMinutes={meta.minutes}
        initialRawText={meta.rawText ?? ""}
        aiReady={aiEnabled()}
      />
    </div>
  );
}
