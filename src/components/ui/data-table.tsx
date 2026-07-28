"use client";

import { Fragment, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  Search,
} from "lucide-react";
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
  data: all,
  columns,
  pageSize = 10,
  emptyMessage = "데이터가 없습니다",
  renderExpanded,
  rowKey,
  searchPlaceholder,
}: {
  data: T[];
  columns: Column<T>[];
  pageSize?: number;
  emptyMessage?: string;
  /** 주면 행을 펼칠 수 있게 된다 — 문의 본문·답변처럼 목록에 안 들어가는 내용용 */
  renderExpanded?: (row: T) => React.ReactNode;
  /** renderExpanded를 쓸 때 행을 구분할 값. 없으면 정렬·페이지 이동 시 펼침이 엉킨다 */
  rowKey?: (row: T) => string;
  /** 주면 표 위에 검색창이 붙는다 — 컬럼 값 전체에서 찾는다 */
  searchPlaceholder?: string;
}) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(
    null,
  );
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const keyOf = (row: T, i: number) => rowKey?.(row) ?? String(i);

  // 컬럼 값만 훑는다 — 화면에 없는 필드까지 걸리면 "왜 이게 나오지"가 된다
  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((row) =>
      columns.some((c) =>
        String(row[c.key] ?? "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [all, query, columns]);

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

  // 검색 결과가 없는 것과 데이터가 없는 것은 다른 상태다 — 검색창을 지우고 싶을 테니 남긴다
  if (all.length === 0) return <EmptyState title={emptyMessage} />;

  return (
    <div className="space-y-3">
      {searchPlaceholder && (
        <div className="flex h-9 max-w-sm items-center gap-2 rounded-md border bg-card px-2.5">
          <Search className="size-4 shrink-0 text-gray-400" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder={searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-xs text-gray-500 hover:text-foreground"
            >
              지우기
            </button>
          )}
        </div>
      )}
      {data.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          &ldquo;{query}&rdquo;와 맞는 항목이 없습니다.
        </p>
      )}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-gray-200 bg-gray-50 hover:bg-gray-50">
              {renderExpanded && <TableHead className="w-10" />}
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
            {rows.map((row, i) => {
              const key = keyOf(row, i);
              const expanded = open === key;
              return (
                <Fragment key={key}>
                  <TableRow
                    className={renderExpanded ? "cursor-pointer" : undefined}
                    onClick={
                      renderExpanded
                        ? () => setOpen(expanded ? null : key)
                        : undefined
                    }
                  >
                    {renderExpanded && (
                      <TableCell className="w-10">
                        {/* 행 클릭은 편의고, 키보드로 여닫는 건 이 버튼이 담당한다 */}
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-label={expanded ? "접기" : "펼치기"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpen(expanded ? null : key);
                          }}
                          className="flex size-6 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-foreground"
                        >
                          <ChevronRight
                            className={`size-4 transition-transform ${expanded ? "rotate-90" : ""}`}
                          />
                        </button>
                      </TableCell>
                    )}
                    {columns.map((col) => (
                      <TableCell key={col.key} className={col.className}>
                        {col.render
                          ? col.render(row)
                          : (row[col.key] as React.ReactNode)}
                      </TableCell>
                    ))}
                  </TableRow>
                  {renderExpanded && expanded && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell
                        colSpan={columns.length + 1}
                        className="bg-gray-50 px-4 py-4"
                      >
                        {renderExpanded(row)}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
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
