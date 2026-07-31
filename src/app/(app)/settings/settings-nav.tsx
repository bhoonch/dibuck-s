"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  LayoutGrid,
  Scale,
  Stamp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 여기는 전부 단지의 것만 — 디벅을 어떻게 쓰나(구독·결제)는 메인 메뉴로,
 * 개인의 것(내 계정)은 사이드바 하단 프로필 칩(/account)으로 나갔다.
 * 성격이 다른 게 한 서랍에 섞여 있던 게 "뭐가 어디 있는지 모르겠다"의 원인이었다.
 */
const items: { name: string; href: string; icon: LucideIcon }[] = [
  { name: "단지 정보", href: "/settings", icon: Building2 },
  { name: "세대 관리", href: "/settings/units", icon: LayoutGrid },
  { name: "직원 관리", href: "/settings/staff", icon: Users },
  { name: "결재선", href: "/settings/approval-line", icon: Stamp },
  { name: "전결 규정", href: "/settings/director-limit", icon: Scale },
];

/**
 * 설정 세로 메뉴 — 가로 탭은 항목이 늘면 빡빡해서 세로로 두었다.
 */
export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-px lg:sticky lg:top-20">
      {items.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-semibold transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-gray-600 hover:bg-gray-100 hover:text-foreground",
            )}
          >
            <t.icon className="size-4 shrink-0" />
            {t.name}
          </Link>
        );
      })}
    </nav>
  );
}
