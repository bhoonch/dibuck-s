"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/ui/data-table";

export type DunningDocRow = {
  id: string;
  docNo: string;
  title: string;
  /** 검색용 전체 세대 나열("101동 502호 홍길동, …") — 화면에는 안 보이고 검색에만 걸린다 */
  units: string;
  /** 단계 구성 요약("1차 2 · 3차 1") */
  stages: string;
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
    key: "stages",
    header: "단계",
    className: "text-muted-foreground",
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
  {
    // 검색 전용 — 전체 세대 나열이라 동호수·이름 검색이 여기서 걸린다.
    // 화면에 그리면 칸이 문장이 되므로 숨긴다(검색은 값만 훑는다).
    key: "units",
    header: "",
    className: "hidden",
  },
];

export function DunningDocsTable({ rows }: { rows: DunningDocRow[] }) {
  return (
    <DataTable
      data={rows}
      columns={columns}
      pageSize={15}
      emptyMessage="아직 만든 독촉장이 없습니다"
      searchPlaceholder="독촉장 검색 — 문서번호·동호수·이름"
    />
  );
}
