"use client";

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
  [key: string]: unknown;
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
      <Link
        href={`/modules/approvals/${row.id}`}
        className="font-medium hover:underline"
      >
        {row.title}
      </Link>
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

export function GianTable({ rows }: { rows: GianRow[] }) {
  return (
    <DataTable
      data={rows}
      columns={columns}
      rowKey={(row) => row.id}
      searchPlaceholder="문서번호·제목·작성자 검색"
      emptyMessage="아직 작성한 문서가 없습니다"
    />
  );
}
