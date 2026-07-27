"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { name: "단지 정보", href: "/settings" },
  { name: "세대 관리", href: "/settings/units" },
  { name: "직원 관리", href: "/settings/staff" },
  { name: "결재선", href: "/settings/approval-line" },
  { name: "구독 관리", href: "/settings/subscriptions" },
  { name: "결제", href: "/settings/billing" },
  { name: "내 계정", href: "/settings/account" },
];

export function SettingsTabs() {
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex gap-1 border-b">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn(
            "border-b-2 px-4 py-2.5 text-base font-medium transition-colors",
            pathname === t.href
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {t.name}
        </Link>
      ))}
    </nav>
  );
}
