"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Building2, LayoutGrid, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { name: "지표", href: "/admin", icon: BarChart3 },
  { name: "단지 관리", href: "/admin/tenants", icon: Building2 },
  { name: "모듈 관리", href: "/admin/modules", icon: LayoutGrid },
  { name: "공지 관리", href: "/admin/announcements", icon: Megaphone },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-1 px-3 pb-4">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== "/admin" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
            )}
          >
            <item.icon className="size-5" />
            {item.name}
          </Link>
        );
      })}
    </nav>
  );
}
