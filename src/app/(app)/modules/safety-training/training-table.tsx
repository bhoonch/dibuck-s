"use client";

import Link from "next/link";
import { docStatusLabels, docStatusStyles } from "@/lib/labels";
import { DataTable, type Column } from "@/components/ui/data-table";

export type TrainingRow = {
  id: string;
  docNo: string;
  title: string;
  courseLabel: string;
  date: string;
  attendeeCount: number;
  status: string;
  author: string;
  [key: string]: unknown;
};

/* 공지문 목록(notice-table.tsx)과 같은 컬럼 문법 */
const columns: Column<TrainingRow>[] = [
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
        href={`/modules/safety-training/${row.id}`}
        className="font-medium hover:underline"
      >
        {row.title}
      </Link>
    ),
  },
  {
    key: "courseLabel",
    header: "구분",
    sortable: true,
    render: (row) => <span className="text-gray-600">{row.courseLabel}</span>,
  },
  {
    key: "date",
    header: "교육일자",
    sortable: true,
    render: (row) => (
      <span className="font-mono text-xs text-gray-500">{row.date}</span>
    ),
  },
  {
    key: "attendeeCount",
    header: "참석",
    sortable: true,
    render: (row) => (
      <span className="font-mono text-xs text-gray-500">{row.attendeeCount}명</span>
    ),
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

export function TrainingTable({ rows }: { rows: TrainingRow[] }) {
  return (
    <DataTable
      data={rows}
      columns={columns}
      rowKey={(row) => row.id}
      searchPlaceholder="문서번호·제목·작성자 검색"
      emptyMessage="아직 만든 교육일지가 없습니다"
    />
  );
}
