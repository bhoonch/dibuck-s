import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { ymdKst } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { GianTable } from "./gian-table";

export default async function GianModulePage() {
  const session = await requireSession();
  if (!(await isSubscribed(session.tenantId!, "approvals")))
    redirect("/settings/subscriptions");

  const docs = await db.document.findMany({
    where: { tenantId: session.tenantId!, moduleId: "approvals" },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      docNo: true,
      type: true,
      title: true,
      status: true,
      createdAt: true,
      createdBy: { select: { name: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="기안·품의"
        description="다섯 항목 입력으로 기안서·품의서 초안을 만들고 결재까지 진행합니다."
      >
        <Button asChild size="lg">
          <Link href="/modules/approvals/new">
            <FilePlus2 className="size-4" /> 새 기안·품의
          </Link>
        </Button>
      </PageHeader>

      {docs.length === 0 ? (
        <div className="mx-auto max-w-lg pt-10">
          <EmptyState
            icon={FilePlus2}
            title="아직 작성한 문서가 없습니다"
            description="공사·수리·용역 안건을 다섯 항목만 입력하면 결재란까지 갖춘 초안이 완성됩니다."
          >
            <Button asChild>
              <Link href="/modules/approvals/new">첫 문서 만들기</Link>
            </Button>
          </EmptyState>
        </div>
      ) : (
        <GianTable
          rows={docs.map((d) => ({
            id: d.id,
            docNo: d.docNo ?? "",
            title: d.title,
            type: d.type,
            status: d.status,
            author: d.createdBy?.name ?? "-",
            createdAt: ymdKst(d.createdAt),
          }))}
        />
      )}
      {docs.length > 0 && (
        <p className="mt-2.5 text-xs text-muted-foreground">
          문서함 자동 저장 · 보존기한 5년 (공동주택관리법 시행령 — 관리 서류
          보존)
        </p>
      )}
    </>
  );
}
