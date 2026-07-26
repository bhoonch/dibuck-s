"use client";

import { usePathname } from "next/navigation";
import { adminItems, isActive } from "./admin-nav";

export function AdminHeader() {
  const pathname = usePathname();
  const title =
    adminItems.find((i) => isActive(pathname, i.href))?.title ?? "관리자 콘솔";

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-4 border-b bg-card/85 px-6 backdrop-blur-sm">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
    </header>
  );
}
