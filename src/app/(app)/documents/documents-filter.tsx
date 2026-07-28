"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { docStatusLabels, docTypeLabels } from "@/lib/labels";

const PERIODS: { value: string; label: string }[] = [
  { value: "", label: "전체 기간" },
  { value: "30", label: "최근 30일" },
  { value: "90", label: "최근 90일" },
  { value: "365", label: "최근 1년" },
];

const select =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs";

/**
 * 문서함 필터 — 검색은 서버가 본문까지 뒤지므로 주소로 넘긴다.
 * 엔터를 눌러야 검색되던 것을 400ms 뒤 자동 반영으로 바꿨다: 검색 버튼이 사라진 만큼
 * "눌러야 하나?"를 고민할 일이 없다. 종류·상태·기간은 고르는 즉시 반영한다.
 */
export function DocumentsFilter() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(params.get("q") ?? "");
  // 첫 렌더에서 주소를 다시 쓰지 않도록 — 뒤로가기 이력이 지저분해진다
  const typed = useRef(false);

  const apply = (next: Record<string, string>) => {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    router.replace(sp.size ? `${pathname}?${sp}` : pathname, { scroll: false });
  };

  useEffect(() => {
    if (!typed.current) return;
    const t = setTimeout(() => apply({ q }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply는 매 렌더 새로 만들어진다
  }, [q]);

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <div className="flex h-9 w-full max-w-sm items-center gap-2 rounded-md border bg-card px-2.5">
        <Search className="size-4 shrink-0 text-gray-400" />
        <input
          value={q}
          onChange={(e) => {
            typed.current = true;
            setQ(e.target.value);
          }}
          placeholder="제목·내용·문서번호 검색"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
        />
        {q && (
          <button
            type="button"
            onClick={() => {
              typed.current = true;
              setQ("");
            }}
            className="text-xs text-gray-500 hover:text-foreground"
          >
            지우기
          </button>
        )}
      </div>

      <select
        className={select}
        value={params.get("type") ?? ""}
        onChange={(e) => apply({ type: e.target.value })}
      >
        <option value="">전체 종류</option>
        {Object.entries(docTypeLabels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <select
        className={select}
        value={params.get("status") ?? ""}
        onChange={(e) => apply({ status: e.target.value })}
      >
        <option value="">전체 상태</option>
        {Object.entries(docStatusLabels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>

      <select
        className={select}
        value={params.get("days") ?? ""}
        onChange={(e) => apply({ days: e.target.value })}
      >
        {PERIODS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
    </div>
  );
}
