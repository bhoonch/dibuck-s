import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { DocumentsFilter } from "./documents-filter";
import { DocumentsTable, type DocRow } from "./documents-table";
import { ymdKst } from "@/lib/utils";

/** 기간 필터의 기준 시각. 0·NaN이면 기간 제한 없음 */
function daysAgo(n: number) {
  if (!(n > 0)) return null;
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    type?: string;
    status?: string;
    days?: string;
  }>;
}) {
  const session = await requireSession();
  const { q, type, status, days } = await searchParams;
  const since = daysAgo(Number(days));

  /* ponytail: contains 검색으로 시작 — 문서가 수만 건 되면 Postgres 전문검색(tsvector)으로 전환 */
  const [documents, modules] = await Promise.all([
    db.document.findMany({
      where: {
        tenantId: session.tenantId!,
        ...(type ? { type } : {}),
        ...(status ? { status } : {}),
        ...(since ? { createdAt: { gte: since } } : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { content: { contains: q, mode: "insensitive" } },
                { docNo: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.module.findMany({ select: { id: true, name: true } }),
  ]);
  const moduleNames = new Map(modules.map((m) => [m.id, m.name]));

  const rows: DocRow[] = documents.map((d) => ({
    docNo: d.docNo ?? "",
    title: d.title,
    type: d.type,
    moduleName: (d.moduleId && moduleNames.get(d.moduleId)) || "-",
    status: d.status,
    createdAt: ymdKst(d.createdAt),
    // 열어 볼 화면이 있는 모듈만 링크가 된다 — 아직 화면이 없는 모듈은 눌러도 갈 곳이 없다
    href:
      d.moduleId === "approvals" ? `/modules/approvals/${d.id}` : null,
  }));

  return (
    <>
      <PageHeader
        title="통합 문서함"
        description="모든 모듈이 생성한 문서를 한 곳에서 검색합니다."
      />
      <DocumentsFilter />
      <DocumentsTable
        rows={rows}
        emptyMessage={
          q ? `"${q}"에 대한 검색 결과가 없습니다` : "아직 만든 문서가 없습니다"
        }
      />
    </>
  );
}
