import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { isSubscribed } from "@/lib/modules";
import { ymdKst } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { GuideLink } from "@/components/guide-link";
import { NoticeTable } from "./notice-table";

export default async function NoticeHomePage() {
  const session = await requireTenantSession();
  const tenantId = session.tenantId!;
  if (!(await isSubscribed(tenantId, "notice"))) redirect("/subscriptions");

  // 한 단지의 공지 대장은 하나 — 결재 파생 공고문(moduleId: approvals)도 같은 채번을
  // 쓰므로 함께 싣는다. 그쪽 문서는 열람만 하고 수정·폐기는 원 품의 화면이 담당한다.
  const docs = await db.document.findMany({
    where: { tenantId, type: "notice" },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      docNo: true,
      title: true,
      status: true,
      moduleId: true,
      sourceDocId: true,
      meta: true,
      createdAt: true,
      createdBy: { select: { name: true } },
    },
  });
  // 파생본 역링크용 원본 문서번호
  const sourceIds = docs.map((d) => d.sourceDocId).filter(Boolean) as string[];
  const sources = sourceIds.length
    ? await db.document.findMany({
        where: { id: { in: sourceIds } },
        select: { id: true, docNo: true },
      })
    : [];
  const srcNo = new Map(sources.map((s) => [s.id, s.docNo]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI 공지문 완성"
        description="유형을 고르고 일시·대상·내용만 입력하면 게시판·승강기에 붙일 공고문·안내문이 완성됩니다."
      >
        <GuideLink section="notice" />
        <Button asChild size="lg">
          <Link href="/modules/notice/new">
            <FilePlus2 className="size-4" /> 새 공지문
          </Link>
        </Button>
      </PageHeader>
      <NoticeTable
        rows={docs.map((d) => {
          const derived = d.moduleId !== "notice";
          const kind = (d.meta as { kind?: string } | null)?.kind;
          return {
            id: d.id,
            docNo: d.docNo ?? "",
            title: d.title,
            // 결재 파생 공고문은 전부 공고문 격이다
            kindLabel: derived || kind === "official" ? "공고문" : "안내문",
            status: d.status,
            author: d.createdBy?.name ?? "",
            date: ymdKst(d.createdAt),
            href: derived ? `/modules/approvals/${d.id}` : `/modules/notice/${d.id}`,
            source: d.sourceDocId
              ? {
                  href: `/modules/approvals/${d.sourceDocId}`,
                  docNo: srcNo.get(d.sourceDocId) ?? "원본 품의",
                }
              : null,
          };
        })}
      />
    </div>
  );
}
