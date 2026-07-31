"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/ui/data-table";

export type DunningDocRow = {
  id: string;
  docNo: string;
  title: string;
  count: number;
  /** KST "YYYY-MM-DD" — 정렬·표시 둘 다 이 값 */
  date: string;
  [key: string]: unknown;
};

const columns: Column<DunningDocRow>[] = [
  {
    key: "docNo",
    header: "문서번호",
    sortable: true,
    className: "font-mono text-xs text-gray-600",
  },
  {
    key: "title",
    header: "제목",
    sortable: true,
    render: (row) => (
      <Link href={`/modules/dunning/${row.id}`} className="font-medium hover:underline">
        {row.title}
      </Link>
    ),
  },
  {
    key: "count",
    header: "세대수",
    sortable: true,
    render: (row) => `${row.count}세대`,
  },
  {
    key: "date",
    header: "날짜",
    sortable: true,
    className: "w-28 font-mono text-xs text-muted-foreground",
  },
];

export function DunningDocsTable({ rows }: { rows: DunningDocRow[] }) {
  return (
    <DataTable
      data={rows}
      columns={columns}
      pageSize={15}
      emptyMessage="아직 만든 독촉장이 없습니다"
      searchPlaceholder="독촉장 검색 — 문서번호·제목"
    />
  );
}
