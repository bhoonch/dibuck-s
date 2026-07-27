"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** name = 사이드바 라벨, title = 상단 헤더 제목 (클로드디자인 adminTabs / adminTitles) */
export const adminItems = [
  { name: "개요", title: "관리자 콘솔", href: "/admin" },
  { name: "가입자 현황", title: "가입자 현황", href: "/admin/tenants" },
  { name: "수입 현황", title: "수입 현황", href: "/admin/revenue" },
  { name: "모듈 관리 · 가격", title: "모듈 관리", href: "/admin/modules" },
  { name: "공지 관리", title: "공지 관리", href: "/admin/announcements" },
  { name: "고객 문의", title: "고객 문의", href: "/admin/support" },
  { name: "작업 이력", title: "작업 이력", href: "/admin/logs" },
];

export function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

export function AdminNav({ supportCount }: { supportCount: number }) {
  const pathname = usePathname();
  return (
    <div className="flex-1 overflow-y-auto px-2 pb-2">
      <div className="px-2.5 pb-1.5 pt-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
        관리자 메뉴
      </div>
      {adminItems.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
              active
                ? "bg-blue-50 font-semibold text-blue-700"
                : "text-gray-700 hover:bg-gray-100",
            )}
          >
            <span
              className={cn(
                "size-1.5 shrink-0 rounded-full",
                active ? "bg-blue-600" : "bg-gray-300",
              )}
            />
            <span>{item.name}</span>
            {item.href === "/admin/support" && supportCount > 0 && (
              <span className="ml-auto rounded-full bg-red-50 px-[7px] py-px font-mono text-xs text-red-700">
                {supportCount}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
