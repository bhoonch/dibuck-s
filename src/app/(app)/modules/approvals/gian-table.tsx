"use client";

import { useState } from "react";
import Link from "next/link";
import { docTypeLabels } from "@/lib/labels";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusCell } from "@/components/doc-status";

export type GianRow = {
  id: string;
  docNo: string;
  title: string;
  type: string;
  status: string;
  /** 지금 결재 차례인 사람 — 결재 중이 아니면 null */
  waitingOn: string | null;
  author: string;
  createdAt: string;
  /** 파생 문서면 원본 품의 — 행에서 바로 거슬러 올라간다 */
  source: { id: string; docNo: string } | null;
  /** 원본이면 파생 문서들(공고→완료보고→지출결의) — 사업 진행이 행 하나에 보인다 */
  links: { id: string; label: string; status: string }[];
  [key: string]: unknown;
};

/** 칩에 싣는 상태 한 글자·한 단어 — 파생 문서는 상태 pill을 또 달 자리가 없다 */
const chipStatus: Record<string, { text: string; cls: string }> = {
  final: { text: "✓", cls: "text-green-600" },
  pending: { text: "결재중", cls: "text-blue-700" },
  draft: { text: "초안", cls: "text-gray-500" },
  rejected: { text: "반려", cls: "text-red-600" },
};

/* 문서함(documents-table.tsx)과 같은 컬럼 문법 — 목록이 두 벌로 갈리지 않게 */
const columns: Column<GianRow>[] = [
  {
    key: "docNo",
    header: "문서번호",
    sortable: true,
    render: (row) => (
      <span className="font-mono text-xs text-gray-600">{row.docNo || "-"}</span>
    ),
  },
  {
    key: "title",
    header: "제목",
    sortable: true,
    render: (row) => (
      <div className="min-w-0">
        <Link
          href={`/modules/approvals/${row.id}`}
          className="font-medium hover:underline"
        >
          {row.title}
        </Link>
        {row.source && (
          <Link
            href={`/modules/approvals/${row.source.id}`}
            className="mt-0.5 block text-xs text-gray-500 hover:underline"
          >
            ← {row.source.docNo || "원본 품의"}
          </Link>
        )}
        {row.links.length > 0 && (
          <span className="mt-1 flex flex-wrap gap-1">
            {row.links.map((l) => {
              const s = chipStatus[l.status] ?? {
                text: l.status,
                cls: "text-gray-500",
              };
              return (
                <Link
                  key={l.id}
                  href={`/modules/approvals/${l.id}`}
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50"
                >
                  {l.label} <span className={s.cls}>{s.text}</span>
                </Link>
              );
            })}
          </span>
        )}
      </div>
    ),
  },
  {
    key: "type",
    header: "종류",
    sortable: true,
    render: (row) => (
      <span className="text-gray-600">
        {docTypeLabels[row.type] ?? row.type}
      </span>
    ),
  },
  {
    key: "status",
    header: "상태",
    render: (row) => <StatusCell status={row.status} waitingOn={row.waitingOn} />,
  },
  {
    key: "author",
    header: "작성자",
    sortable: true,
    render: (row) => (
      <span className="text-xs text-gray-500">{row.author}</span>
    ),
  },
  {
    key: "createdAt",
    header: "작성일",
    sortable: true,
    render: (row) => (
      <span className="font-mono text-xs text-gray-500">{row.createdAt}</span>
    ),
  },
];

/** 종류 필터 — 원본(기안·품의)과 파생 3종. 없는 종류의 칩은 그리지 않는다 */
const FILTERS: { key: string; label: string; types: string[] | null }[] = [
  { key: "all", label: "전체", types: null },
  { key: "main", label: "기안·품의", types: ["gian", "approval"] },
  { key: "notice", label: "공고문", types: ["notice"] },
  { key: "report", label: "완료보고", types: ["report"] },
  { key: "expense", label: "지출결의", types: ["expense"] },
];

export function GianTable({ rows }: { rows: GianRow[] }) {
  const [filter, setFilter] = useState("all");
  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const shown = active.types
    ? rows.filter((r) => active.types!.includes(r.type))
    : rows;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.filter(
          (f) => !f.types || rows.some((r) => f.types!.includes(r.type)),
        ).map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={
              "rounded-full border px-3 py-1 text-sm " +
              (filter === f.key
                ? "border-primary bg-primary text-primary-foreground"
                : "text-gray-600 hover:bg-gray-50")
            }
          >
            {f.label}
          </button>
        ))}
      </div>
      <DataTable
        data={shown}
        columns={columns}
        rowKey={(row) => row.id}
        searchPlaceholder="문서번호·제목·작성자 검색"
        emptyMessage="아직 작성한 문서가 없습니다"
      />
    </div>
  );
}
