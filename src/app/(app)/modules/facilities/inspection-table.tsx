"use client";

import Link from "next/link";
import { docStatusLabels, docStatusStyles } from "@/lib/labels";
import { DataTable, type Column } from "@/components/ui/data-table";

export type InspectionRow = {
  id: string;
  docNo: string;
  title: string;
  itemName: string;
  doneAt: string;
  result: string;
  status: string;
  author: string;
  [key: string]: unknown;
};

/* 교육일지 목록(training-table.tsx)과 같은 컬럼 문법 */
const columns: Column<InspectionRow>[] = [
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
        href={`/modules/facilities/${row.id}`}
        className="font-medium hover:underline"
      >
        {row.title}
      </Link>
    ),
  },
  {
    key: "itemName",
    header: "항목",
    sortable: true,
    render: (row) => <span className="text-gray-600">{row.itemName}</span>,
  },
  {
    key: "doneAt",
    header: "실시일",
    sortable: true,
    render: (row) => (
      <span className="font-mono text-xs text-gray-500">{row.doneAt}</span>
    ),
  },
  {
    key: "result",
    header: "결과",
    render: (row) =>
      row.result ? (
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            row.result === "지적사항"
              ? "bg-amber-50 text-amber-700"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {row.result}
        </span>
      ) : null,
  },
  {
    key: "status",
    header: "상태",
    render: (row) => (
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          docStatusStyles[row.status] ?? ""
        }`}
      >
        {docStatusLabels[row.status] ?? row.status}
      </span>
    ),
  },
  {
    key: "author",
    header: "작성자",
    sortable: true,
    render: (row) => <span className="text-xs text-gray-500">{row.author}</span>,
  },
];

export function InspectionTable({ rows }: { rows: InspectionRow[] }) {
  return (
    <DataTable
      data={rows}
      columns={columns}
      rowKey={(row) => row.id}
      searchPlaceholder="문서번호·제목·항목 검색"
      emptyMessage="아직 점검 기록이 없습니다"
    />
  );
}
