"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CreditCard, Package } from "lucide-react";
import { cn } from "@/lib/utils";

/** 두 장뿐이라 가로 탭 — 설정이 세로로 간 건 항목이 7개여서다 */
const tabs = [
  { name: "구독 관리", href: "/subscriptions", icon: Package },
  { name: "결제", href: "/billing", icon: CreditCard },
];

export function SectionTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-semibold transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-gray-500 hover:text-foreground",
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
