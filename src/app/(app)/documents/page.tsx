import { requireTenantSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { DocumentsFilter } from "./documents-filter";
import { DocumentsTable, type DocRow } from "./documents-table";
import { ymdKst } from "@/lib/utils";
import { waitingOnLabel } from "@/lib/gian/rules";

/** 문서 상세 화면(/modules/{id}/[docId])이 있는 모듈 — 전부 같은 경로 규칙을 쓴다 */
const LINKABLE_MODULES = new Set([
  "approvals",
  "dunning",
  "notice",
  "safety-training",
  "facilities",
]);

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
  const session = await requireTenantSession();
  const { q, type, status, days } = await searchParams;
  const since = daysAgo(Number(days));

  /* ponytail: contains 검색으로 시작 — 문서가 수만 건 되면 Postgres 전문검색(tsvector)으로 전환 */
  const [documents, modules] = await Promise.all([
    db.document.findMany({
      where: {
        tenantId: session.tenantId!,
        // 쉼표로 여러 type을 받는다 — 홈의 "결재 대기"는 결재 문서 4종 합계라
        // 단일 type 필터로는 카운트와 목록이 안 맞는다 (?type=approval,gian,report,expense)
        ...(type ? { type: { in: type.split(",") } } : {}),
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
      // 결재 중인 문서는 지금 누구 차례인지까지 — 결재선 없는 모듈 문서는 빈 배열
      include: {
        approvalSteps: {
          where: { status: "pending" },
          select: { name: true, externalRole: true },
          take: 1,
        },
      },
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
    waitingOn: waitingOnLabel(d.approvalSteps[0]),
    createdAt: ymdKst(d.createdAt),
    // 열어 볼 화면이 있는 모듈만 링크가 된다 — 아직 화면이 없는 모듈(contracts)은
    // 눌러도 갈 곳이 없다. 새 모듈에 [docId] 화면을 만들면 여기 목록에 추가할 것.
    href:
      d.moduleId && LINKABLE_MODULES.has(d.moduleId)
        ? `/modules/${d.moduleId}/${d.id}`
        : null,
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
