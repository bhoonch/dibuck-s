"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderOpen,
  Home,
  LayoutGrid,
  Lock,
  LogOut,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/app/login/actions";

export type NavModule = {
  id: string;
  name: string;
  route: string;
  subscribed: boolean;
  badge?: number; // 미처리 건수 (계약 만료, 미처리 민원 등)
};

export function SideNav({
  tenantName,
  tenantMeta,
  userName,
  userRole,
  docCount,
  modules,
}: {
  tenantName: string;
  tenantMeta: string;
  userName: string;
  userRole: string;
  docCount: number;
  modules: NavModule[];
}) {
  const pathname = usePathname();
  const subscribed = modules.filter((m) => m.subscribed);
  const locked = modules.filter((m) => !m.subscribed);
  const linkClass = (active: boolean) =>
    cn(
      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
      active
        ? "bg-accent text-accent-foreground"
        : "text-gray-700 hover:bg-gray-100",
    );
  const coreItems = [
    { name: "홈", href: "/", icon: Home },
    { name: "모듈 런처", href: "/modules", icon: LayoutGrid },
    { name: "문서함", href: "/documents", icon: FolderOpen, count: docCount },
    { name: "설정", href: "/settings", icon: Settings },
  ];

  return (
    <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col border-r bg-sidebar">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-4">
        <div className="flex size-6 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          디
        </div>
        <b className="text-sm tracking-tight">디벅</b>
        <span className="ml-auto font-mono text-xs text-gray-400">v1.0</span>
      </div>

      <div className="m-3 flex items-center gap-2.5 rounded-lg border bg-background p-2.5">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-blue-100 text-xs font-bold text-blue-800">
          {tenantName.charAt(0)}
        </span>
        <span className="block min-w-0">
          <span className="block truncate text-sm font-semibold">
            {tenantName}
          </span>
          <span className="block font-mono text-xs text-gray-500">
            {tenantMeta}
          </span>
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-2">
        {coreItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={linkClass(
              pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href)),
            )}
          >
            <item.icon className="size-4" />
            {item.name}
            {item.count !== undefined && item.count > 0 && (
              <span className="ml-auto rounded-full bg-gray-100 px-1.5 py-px font-mono text-xs text-gray-500">
                {item.count}
              </span>
            )}
          </Link>
        ))}

        <p className="px-2.5 pb-1.5 pt-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
          구독 모듈
        </p>
        {subscribed.map((m) => (
          <Link
            key={m.id}
            href={m.route}
            className={linkClass(pathname.startsWith(m.route))}
          >
            <span className="size-1.5 shrink-0 rounded-full bg-gray-300" />
            <span className="truncate text-sm">{m.name}</span>
            {m.badge !== undefined && m.badge > 0 && (
              <span className="ml-auto rounded-full bg-red-50 px-1.5 py-px font-mono text-xs text-red-700">
                {m.badge}
              </span>
            )}
          </Link>
        ))}

        {locked.length > 0 && (
          <>
            <p className="px-2.5 pb-1.5 pt-4 text-xs font-semibold uppercase tracking-wider text-gray-400">
              미구독
            </p>
            {locked.map((m) => (
              <Link
                key={m.id}
                href="/settings/subscriptions"
                className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-gray-400 transition-colors hover:bg-gray-100"
                title="구독하면 사용할 수 있어요"
              >
                <Lock className="size-3.5 shrink-0" />
                <span className="truncate">{m.name}</span>
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-gray-100 p-2">
        <div className="flex items-center gap-2.5 p-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gray-800 text-xs font-semibold text-white">
            {userName.charAt(0)}
          </span>
          <span className="block min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              {userName}
            </span>
            <span className="block text-xs text-gray-500">{userRole}</span>
          </span>
          <form action={logout}>
            <button
              type="submit"
              aria-label="로그아웃"
              className="flex size-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
