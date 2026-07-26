"use client";

import { DataTable, type Column } from "@/components/ui/data-table";

export type UnitRow = {
  dong: string;
  ho: string;
  name: string;
  phone: string;
  [key: string]: unknown;
};

const columns: Column<UnitRow>[] = [
  {
    key: "dong",
    header: "동",
    sortable: true,
    sortValue: (r) => Number(r.dong) || r.dong,
    render: (r) => <span className="font-mono">{r.dong}</span>,
  },
  {
    key: "ho",
    header: "호",
    sortable: true,
    sortValue: (r) => Number(r.ho) || r.ho,
    render: (r) => <span className="font-mono">{r.ho}</span>,
  },
  { key: "name", header: "이름" },
  {
    key: "phone",
    header: "연락처",
    render: (r) => <span className="font-mono text-xs">{r.phone}</span>,
  },
];

export function UnitsTable({ rows }: { rows: UnitRow[] }) {
  return (
    <DataTable
      data={rows}
      columns={columns}
      pageSize={15}
      emptyMessage="아직 등록된 세대가 없습니다. 엑셀로 업로드해 보세요."
    />
  );
}
