"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderOpen,
  Home,
  Lock,
  LogOut,
  MessageCircleQuestion,
  Package,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { logout } from "@/app/login/actions";
import { stopImpersonation } from "@/app/admin/actions";

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
  impersonating = false,
  className,
}: {
  tenantName: string;
  tenantMeta: string;
  userName: string;
  userRole: string;
  docCount: number;
  modules: NavModule[];
  /** 관리자가 테스트로 사용자 화면을 보는 중 — 하단에 콘솔 복귀 버튼을 띄운다 */
  impersonating?: boolean;
  /** 데스크톱 상주 인스턴스는 max-md:hidden — 모바일에선 드로어(MobileNav)가 대신 띄운다 */
  className?: string;
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
  // href에 쿼리가 붙는 항목이 있어서 활성 판정은 match로 따로 본다.
  // 한 메뉴가 두 경로를 품기도 한다(구독·결제) — 그때는 배열.
  const coreItems = [
    { name: "홈", href: "/home", match: "/home", icon: Home },
    {
      name: "문서함",
      href: "/documents",
      match: "/documents",
      icon: FolderOpen,
      count: docCount,
    },
    // "설정"은 안에 뭐가 들었는지 알려주지 않는다 — 세대 등록이 여기 있을 거라고
    // 짐작할 방법이 없었다. 이름으로 내용을 밝힌다. 내 계정은 개인의 것이라
    // 여기 없다 — 하단 프로필 칩(/account)이 입구다.
    {
      name: "단지 관리",
      href: "/settings",
      match: "/settings",
      icon: Settings,
    },
    // 구독·결제는 셀프서비스의 본체라 메인 메뉴에 있어야 하지만, 순서는 설정 다음이다
    // — 홈의 시작 가이드도 단지 정보 → 세대 → 직원 → 모듈 구독 순으로 안내한다.
    // 결제까지 같이 나와야 돈 얘기가 한 자리에 모인다.
    {
      name: "구독·결제",
      href: "/subscriptions",
      match: ["/subscriptions", "/billing"],
      icon: Package,
    },
    // 어느 화면에서 눌렀는지 실어 보낸다 — 운영자가 상황을 되묻지 않아도 된다
    {
      name: "고객 문의",
      href: `/support?from=${encodeURIComponent(pathname)}`,
      match: "/support",
      icon: MessageCircleQuestion,
    },
  ];

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-dvh w-60 shrink-0 flex-col border-r bg-sidebar",
        className,
      )}
    >
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
              [item.match].flat().some((m) => pathname.startsWith(m)),
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
                href="/subscriptions"
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
        {impersonating && (
          <form action={stopImpersonation}>
            <button
              type="submit"
              title="관리자 대시보드로 돌아갑니다"
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
            >
              <ShieldCheck className="size-4" />
              관리자 대시보드
              <span className="ml-auto font-mono text-xs text-gray-400">
                테스트 중
              </span>
            </button>
          </form>
        )}
        <div className="flex items-center gap-2.5 p-2.5">
          <Link
            href="/account"
            title="내 계정 설정"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md transition-colors hover:bg-gray-100"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gray-800 text-xs font-semibold text-white">
              {userName.charAt(0)}
            </span>
            <span className="block min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">
                {userName}
              </span>
              <span className="block text-xs text-gray-500">{userRole}</span>
            </span>
          </Link>
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
