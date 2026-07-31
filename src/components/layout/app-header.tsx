"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Bell, Search } from "lucide-react";

// 앞에서부터 첫 일치가 이긴다 — 모듈 경로는 "/modules"보다 위에 둬야 한다
const titles: [prefix: string, title: string][] = [
  ["/documents", "통합 문서함"],
  ["/notifications", "알림"],
  ["/settings", "단지·계정 관리"],
  ["/subscriptions", "구독·결제"],
  ["/billing", "구독·결제"],
  ["/modules/approvals", "기안·품의"],
  // 런처는 없앴다(구독·결제에 합침) — 남은 /modules/* 는 아직 화면이 없는 모듈의 자리표시
  ["/modules", "모듈"],
  ["/support", "고객 문의"],
  ["/home", "홈"],
];

export function AppHeader({ unread }: { unread: number }) {
  const pathname = usePathname();
  const searchRef = useRef<HTMLInputElement>(null);
  const title = titles.find(([p]) => pathname.startsWith(p))?.[1] ?? "홈";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-4 border-b bg-card/85 px-6 backdrop-blur-sm">
      {/* 페이지마다 자기 h1(PageHeader)이 있다 — 헤더 바 제목까지 h1이면 문서에 h1이 둘 */}
      <div className="text-lg font-semibold tracking-tight">{title}</div>
      <div className="ml-auto flex items-center gap-2.5">
        <form
          action="/documents"
          title="검색하면 문서함에서 결과를 보여줍니다"
          className="flex h-9 w-80 items-center gap-2 rounded-md border bg-background px-2.5"
        >
          <Search className="size-4 shrink-0 text-gray-400" />
          <input
            ref={searchRef}
            name="q"
            placeholder="문서 검색 — 제목·내용·문서번호"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
          />
          <kbd
            title="Ctrl+K를 누르면 바로 검색창에 입력할 수 있어요"
            className="rounded border bg-card px-1.5 py-px font-mono text-xs text-gray-500"
          >
            Ctrl K
          </kbd>
        </form>
        <Link
          href="/notifications"
          aria-label="알림"
          className="relative flex size-9 items-center justify-center rounded-md border bg-card transition-colors hover:bg-background"
        >
          <Bell className="size-5 text-gray-700" />
          {unread > 0 && (
            <span className="absolute right-1.5 top-1.5 size-[7px] rounded-full border-[1.5px] border-white bg-red-600" />
          )}
        </Link>
      </div>
    </header>
  );
}
