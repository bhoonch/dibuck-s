"use client";

import Link from "next/link";
import { docStatusLabels, docStatusStyles } from "@/lib/labels";
import { DataTable, type Column } from "@/components/ui/data-table";

export type NoticeRow = {
  id: string;
  docNo: string;
  title: string;
  kindLabel: string;
  status: string;
  author: string;
  date: string;
  href: string;
  /** 결재 파생 공고문의 원본 품의 — 행에서 바로 거슬러 올라간다 */
  source: { href: string; docNo: string | null } | null;
  [key: string]: unknown;
};

/* 문서함(documents-table.tsx)과 같은 컬럼 문법 — 목록이 두 벌로 갈리지 않게 */
const columns: Column<NoticeRow>[] = [
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
        <Link href={row.href} className="font-medium hover:underline">
          {row.title}
        </Link>
        {row.source && (
          <Link
            href={row.source.href}
            className="mt-0.5 block text-xs text-gray-500 hover:underline"
          >
            ← {row.source.docNo}
          </Link>
        )}
      </div>
    ),
  },
  {
    key: "kindLabel",
    header: "구분",
    sortable: true,
    render: (row) => <span className="text-gray-600">{row.kindLabel}</span>,
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
  {
    key: "date",
    header: "게시일",
    sortable: true,
    render: (row) => (
      <span className="font-mono text-xs text-gray-500">{row.date}</span>
    ),
  },
];

export function NoticeTable({ rows }: { rows: NoticeRow[] }) {
  return (
    <DataTable
      data={rows}
      columns={columns}
      rowKey={(row) => row.id}
      searchPlaceholder="문서번호·제목·작성자 검색"
      emptyMessage="아직 만든 공지문이 없습니다"
    />
  );
}
