"use client";

import { DataTable, type Column } from "@/components/ui/data-table";
import { cn } from "@/lib/utils";
import { openNotification } from "./actions";

export type NotificationRow = {
  id: string;
  title: string;
  body: string;
  link: string;
  read: boolean;
  /** KST "YYYY-MM-DD" — 정렬·표시 둘 다 이 값 */
  date: string;
  [key: string]: unknown;
};

/**
 * 문서함과 같은 표 문법 — 슬라이드 창이 "빠른 확인"을 맡았으니 이 페이지의
 * 역할은 이력 훑기다. 카드 더미는 100건을 훑기엔 세로를 너무 쓴다.
 * 문서함이 제목 칸에 링크를 넣듯, 여기는 제목 칸이 읽음+이동 버튼이다.
 */
const columns: Column<NotificationRow>[] = [
  {
    key: "read",
    header: "",
    className: "w-8",
    render: (row) =>
      !row.read && (
        <span
          className="mx-auto block size-2 rounded-full bg-primary"
          title="안 읽음"
        />
      ),
  },
  {
    key: "title",
    header: "제목",
    sortable: true,
    render: (row) => (
      // 클릭 = 읽음 처리 후 이동. Link로 두면 배지가 영원히 안 줄어든다
      <form action={openNotification} className="inline">
        <input type="hidden" name="id" value={row.id} />
        <input type="hidden" name="link" value={row.link} />
        <button
          type="submit"
          className={cn(
            "text-left hover:underline",
            row.read ? "text-muted-foreground" : "font-semibold",
          )}
        >
          {row.title}
        </button>
      </form>
    ),
  },
  {
    key: "body",
    header: "내용",
    className: "max-w-[360px] truncate text-muted-foreground",
  },
  {
    key: "date",
    header: "날짜",
    sortable: true,
    className: "w-28 font-mono text-xs text-muted-foreground",
  },
];

export function NotificationsTable({ rows }: { rows: NotificationRow[] }) {
  return (
    <DataTable
      data={rows}
      columns={columns}
      pageSize={15}
      emptyMessage="아직 알림이 없습니다"
      searchPlaceholder="알림 검색 — 제목·내용"
    />
  );
}
