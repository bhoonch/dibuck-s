import { Search } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { docTypeLabels } from "@/lib/labels";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DocumentsTable, type DocRow } from "./documents-table";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const session = await requireSession();
  const { q, type } = await searchParams;

  /* ponytail: contains 검색으로 시작 — 문서가 수만 건 되면 Postgres 전문검색(tsvector)으로 전환 */
  const [documents, modules] = await Promise.all([
    db.document.findMany({
      where: {
        tenantId: session.tenantId!,
        ...(type ? { type } : {}),
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
    createdAt: d.createdAt.toISOString().slice(0, 10),
  }));

  return (
    <>
      <PageHeader
        title="통합 문서함"
        description="모든 모듈이 생성한 문서를 한 곳에서 검색합니다."
      />
      <form className="mb-4 flex max-w-xl gap-2">
        <select
          name="type"
          defaultValue={type ?? ""}
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
        >
          <option value="">전체 종류</option>
          {Object.entries(docTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Input name="q" defaultValue={q} placeholder="제목이나 내용으로 검색" />
        <Button type="submit">
          <Search className="size-4" /> 검색
        </Button>
      </form>
      <DocumentsTable
        rows={rows}
        emptyMessage={
          q ? `"${q}"에 대한 검색 결과가 없습니다` : "아직 만든 문서가 없습니다"
        }
      />
    </>
  );
}
