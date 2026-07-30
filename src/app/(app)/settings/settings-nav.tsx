"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CircleUser,
  CreditCard,
  LayoutGrid,
  Package,
  Scale,
  Stamp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { name: string; href: string; icon: LucideIcon };

/**
 * 한 서랍에 성격이 다른 둘이 섞여 있던 게 "뭐가 어디 있는지 모르겠다"의 원인이다.
 * 우리 단지를 어떻게 굴리나(단지 운영)와 디벅을 어떻게 쓰나(서비스 이용)를 나눈다.
 */
const groups: { label: string; items: Item[] }[] = [
  {
    label: "단지 운영",
    items: [
      { name: "단지 정보", href: "/settings", icon: Building2 },
      { name: "세대 관리", href: "/settings/units", icon: LayoutGrid },
      { name: "직원 관리", href: "/settings/staff", icon: Users },
      { name: "결재선", href: "/settings/approval-line", icon: Stamp },
      { name: "전결 규정", href: "/settings/director-limit", icon: Scale },
    ],
  },
  {
    label: "서비스 이용",
    items: [
      { name: "구독 관리", href: "/settings/subscriptions", icon: Package },
      { name: "결제", href: "/settings/billing", icon: CreditCard },
      { name: "내 계정", href: "/settings/account", icon: CircleUser },
    ],
  },
];

/**
 * 설정 세로 메뉴 — 가로 탭은 7개가 빡빡해서 그룹을 나눌 자리가 없었다.
 * 세로는 그룹 라벨을 넣을 여유가 있고, 항목이 더 늘어도 안 깨진다.
 */
export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-px lg:sticky lg:top-20">
      {groups.map((g, gi) => (
        // Fragment로 감싼다 — display:contents 래퍼를 쓰면 모든 라벨이 각자
        // :first-child가 되어 그룹 사이 여백이 통째로 사라진다
        <Fragment key={g.label}>
          <p
            className={cn(
              "px-2.5 pb-1.5 text-xs font-semibold tracking-wider text-gray-400 uppercase",
              gi === 0 ? "pt-0" : "pt-5",
            )}
          >
            {g.label}
          </p>
          {g.items.map((t) => {
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
        </Fragment>
      ))}
    </nav>
  );
}
