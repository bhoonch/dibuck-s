import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { docStatusLabels, docStatusStyles, docTypeLabels } from "@/lib/labels";
import { ymdKst } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

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
        <div className="overflow-hidden rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">문서번호</th>
                <th className="px-4 py-3 font-medium">제목</th>
                <th className="px-4 py-3 font-medium">종류</th>
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="px-4 py-3 font-medium">작성자</th>
                <th className="px-4 py-3 font-medium">작성일</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id} className="border-b last:border-0 hover:bg-accent/40">
                  <td className="px-4 py-3 font-mono text-xs">{d.docNo}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/modules/approvals/${d.id}`}
                      className="font-medium hover:underline"
                    >
                      {d.title}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {docTypeLabels[d.type] ?? d.type}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${docStatusStyles[d.status] ?? "bg-gray-100 text-gray-600"}`}
                    >
                      {docStatusLabels[d.status] ?? d.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {d.createdBy?.name ?? "-"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {ymdKst(d.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
