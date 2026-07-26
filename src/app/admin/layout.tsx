import { ShieldCheck, LogOut } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { Role } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/login/actions";
import { AdminNav } from "./admin-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireRole(Role.SUPER_ADMIN);

  return (
    <div className="flex min-h-dvh">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar">
        <div className="flex items-center gap-2 px-4 py-5">
          <ShieldCheck className="size-6 text-primary" />
          <div>
            <p className="text-sm font-bold leading-tight">디벅 관리자</p>
            <p className="text-xs text-muted-foreground">{session.name}</p>
          </div>
        </div>
        <AdminNav />
        <form action={logout} className="border-t p-3">
          <Button type="submit" variant="ghost" className="w-full justify-start">
            <LogOut className="size-4" /> 로그아웃
          </Button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 p-6 lg:p-8">{children}</main>
    </div>
  );
}
