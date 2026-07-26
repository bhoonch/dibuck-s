"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

export type Column<T> = {
  key: string;
  header: string;
  sortable?: boolean;
  /** 정렬 기준 값. 생략 시 row[key] 사용 */
  sortValue?: (row: T) => string | number;
  render?: (row: T) => React.ReactNode;
  className?: string;
};

/* ponytail: 클라이언트 정렬·페이징 — 수천 건 넘는 목록이 생기면 해당 페이지만 서버 페이징으로 전환 */
export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  pageSize = 10,
  emptyMessage = "데이터가 없습니다",
}: {
  data: T[];
  columns: Column<T>[];
  pageSize?: number;
  emptyMessage?: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(
    null,
  );
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return data;
    const col = columns.find((c) => c.key === sort.key);
    const val = (row: T) =>
      col?.sortValue ? col.sortValue(row) : (row[sort.key] as string | number);
    return [...data].sort((a, b) => {
      const [va, vb] = [val(a), val(b)];
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), "ko");
      return sort.dir === "asc" ? cmp : -cmp;
    });
  }, [data, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const rows = sorted.slice(current * pageSize, (current + 1) * pageSize);

  const toggleSort = (key: string) =>
    setSort((s) =>
      s?.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );

  if (data.length === 0) return <EmptyState title={emptyMessage} />;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-gray-200 bg-gray-50 hover:bg-gray-50">
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={`text-xs font-semibold uppercase tracking-wider text-gray-500 ${col.className ?? ""}`}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground"
                      onClick={() => toggleSort(col.key)}
                    >
                      {col.header}
                      {sort?.key !== col.key ? (
                        <ArrowUpDown className="size-3.5" />
                      ) : sort.dir === "asc" ? (
                        <ArrowUp className="size-3.5" />
                      ) : (
                        <ArrowDown className="size-3.5" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow key={i}>
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.className}>
                    {col.render
                      ? col.render(row)
                      : (row[col.key] as React.ReactNode)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {pageCount > 1 && (
        <div className="flex items-center justify-end gap-3 text-sm">
          <span className="text-muted-foreground">
            {current + 1} / {pageCount} 페이지
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            이전
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={current >= pageCount - 1}
            onClick={() => setPage(current + 1)}
          >
            다음
          </Button>
        </div>
      )}
    </div>
  );
}
