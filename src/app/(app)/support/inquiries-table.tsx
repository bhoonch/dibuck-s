"use client";

import { DataTable, type Column } from "@/components/ui/data-table";

export type InquiryRow = {
  id: string;
  category: string;
  title: string;
  userName: string | null; // 옛 행은 null
  createdAt: string;
  status: string;
  answer: string | null;
  answeredAt: string | null;
  [key: string]: unknown;
};

const columns: Column<InquiryRow>[] = [
  {
    key: "category",
    header: "유형",
    sortable: true,
    render: (row) => (
      <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
        {row.category}
      </span>
    ),
  },
  {
    key: "title",
    header: "문의 내용",
    sortable: true,
    // 본문이 500자까지라 목록에서는 한 줄로 자른다 — 전체는 펼쳐서 본다
    render: (row) => (
      <span className="line-clamp-1 font-medium">{row.title}</span>
    ),
  },
  {
    key: "userName",
    header: "작성자",
    sortable: true,
    render: (row) => (
      <span className="text-sm">{row.userName ?? "—"}</span>
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
  {
    key: "status",
    header: "상태",
    render: (row) => (
      <span
        className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${
          row.status === "answered"
            ? "bg-green-50 text-green-700"
            : "bg-amber-50 text-amber-700"
        }`}
      >
        {row.status === "answered" ? "답변 완료" : "답변 대기"}
      </span>
    ),
  },
];

export function InquiriesTable({ rows }: { rows: InquiryRow[] }) {
  return (
    <DataTable
      data={rows}
      columns={columns}
      rowKey={(row) => row.id}
      emptyMessage="아직 남긴 문의가 없습니다"
      renderExpanded={(row) => (
        <div className="grid max-w-3xl gap-3">
          <div>
            {/* 목록은 단지 전체 문의라 "내가 남긴"이 아닐 수 있다 — 중립 표기 */}
            <p className="text-xs font-semibold tracking-wider text-gray-500 uppercase">
              문의 내용
            </p>
            <p className="mt-1.5 text-sm whitespace-pre-wrap">{row.title}</p>
          </div>
          {row.answer ? (
            <div className="rounded-md border-l-[3px] border-l-primary bg-card p-3.5">
              <p className="text-xs font-semibold tracking-wider text-primary uppercase">
                운영팀 답변
                {row.answeredAt && (
                  <span className="ml-2 font-mono font-normal text-gray-500 normal-case">
                    {row.answeredAt}
                  </span>
                )}
              </p>
              <p className="mt-1.5 text-sm whitespace-pre-wrap">{row.answer}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              아직 답변이 등록되지 않았습니다. 답변이 올라오면 알림으로
              알려드립니다.
            </p>
          )}
        </div>
      )}
    />
  );
}
