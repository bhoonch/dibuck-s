"use client";

import Link from "next/link";
import { docStatusLabels, docStatusStyles, docTypeLabels } from "@/lib/labels";
import { DataTable, type Column } from "@/components/ui/data-table";

export type DocRow = {
  docNo: string;
  title: string;
  type: string;
  moduleName: string;
  status: string;
  createdAt: string;
  /** 열어 볼 화면이 있는 문서만 링크 — 아직 화면이 없는 모듈은 null */
  href: string | null;
  [key: string]: unknown;
};

const columns: Column<DocRow>[] = [
  {
    key: "docNo",
    header: "문서번호",
    sortable: true,
    render: (row) => (
      <span className="font-mono text-xs text-gray-600">{row.docNo || "-"}</span>
    ),
  },
  {
    key: "type",
    header: "종류",
    sortable: true,
    render: (row) => (
      <span className="text-gray-600">{docTypeLabels[row.type] ?? row.type}</span>
    ),
  },
  {
    key: "title",
    header: "제목",
    sortable: true,
    render: (row) =>
      row.href ? (
        <Link href={row.href} className="font-medium hover:underline">
          {row.title}
        </Link>
      ) : (
        // 링크가 없는 건 화면이 아직 없어서다 — 눌러도 안 되는 링크를 만들지 않는다
        <span className="font-medium">{row.title}</span>
      ),
  },
  {
    key: "moduleName",
    header: "모듈",
    render: (row) => (
      <span className="text-xs text-gray-500">{row.moduleName}</span>
    ),
  },
  {
    key: "status",
    header: "상태",
    render: (row) => (
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${docStatusStyles[row.status] ?? "bg-gray-100 text-gray-600"}`}
      >
        {docStatusLabels[row.status] ?? row.status}
      </span>
    ),
  },
  {
    key: "createdAt",
    header: "등록일",
    sortable: true,
    render: (row) => (
      <span className="font-mono text-xs text-gray-500">{row.createdAt}</span>
    ),
  },
];

export function DocumentsTable({
  rows,
  emptyMessage,
}: {
  rows: DocRow[];
  emptyMessage: string;
}) {
  return <DataTable data={rows} columns={columns} emptyMessage={emptyMessage} />;
}
