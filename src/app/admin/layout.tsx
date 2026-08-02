import Link from "next/link";
import { LogOut, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { Role } from "@/generated/prisma/enums";
import { logout } from "@/app/login/actions";
import { impersonate } from "./actions";
import { AdminNav } from "./admin-nav";
import { AdminHeader } from "./admin-header";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole(Role.SUPER_ADMIN);
  // 기능 테스트용 사용자 대시보드 진입 대상 — 시드 데모 단지(id 고정)만.
  // "가장 오래된 ACTIVE 단지"로 고르면 운영 DB에선 최고참 실고객이 걸려,
  // 테스트 버튼 한 번이 실고객 단지 임퍼서네이션이 된다. 데모 단지가 없는
  // 환경(운영)에서는 버튼이 아예 그려지지 않는다. 실고객 진입은 지금처럼
  // 단지 상세의 임퍼서네이션(로그 증적 포함)으로만.
  const [testTenant, supportCount] = await Promise.all([
    db.tenant.findUnique({
      where: { id: "demo-tenant", status: "ACTIVE" },
      select: { id: true, name: true },
    }),
    db.inquiry.count({ where: { status: "open" } }),
  ]);

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col border-r bg-sidebar">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-4">
          <div className="flex size-6 items-center justify-center rounded-md bg-gray-800 text-white">
            <ShieldCheck className="size-4" />
          </div>
          <b className="text-sm tracking-tight">디벅 관리자</b>
          <span className="ml-auto font-mono text-xs text-gray-400">admin</span>
        </div>

        <AdminNav supportCount={supportCount} />

        <div className="border-t border-gray-100 p-2">
          {testTenant && (
            <form action={impersonate}>
              <input type="hidden" name="tenantId" value={testTenant.id} />
              <button
                type="submit"
                title={`${testTenant.name} 계정으로 전환해 실제 사용자 화면을 확인합니다`}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100"
              >
                <MonitorSmartphone className="size-4" />
                사용자 대시보드
                <span className="ml-auto font-mono text-xs text-gray-400">
                  테스트
                </span>
              </button>
            </form>
          )}
          <div className="flex items-center gap-2.5 p-2.5">
            <Link
              href="/admin/account"
              title="내 계정 설정"
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md transition-colors hover:bg-gray-100"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gray-800 text-xs font-semibold text-white">
                {session.name.charAt(0)}
              </span>
              <span className="block min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {session.name}
                </span>
                <span className="block text-xs text-gray-500">운영자</span>
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

      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader />
        <main className="w-full max-w-[1440px] flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
