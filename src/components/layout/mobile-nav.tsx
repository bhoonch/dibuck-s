"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

/**
 * 모바일 내비 드로어 — 햄버거 버튼 + 왼쪽에서 나오는 SideNav.
 * children으로 SideNav을 그대로 받는다: 메뉴 구성·뱃지 로직을 두 벌 유지하지 않는다.
 * 경로가 바뀌면(링크 이동) 자동으로 닫힌다.
 */
export function MobileNav({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // 링크를 눌러 이동하면 닫는다 — 드로어가 새 화면을 가리고 남으면 안 된다.
  // effect가 아니라 렌더 중 조정 패턴: 이전 경로를 들고 있다가 바뀐 렌더에서 닫는다
  const [prevPath, setPrevPath] = useState(pathname);
  if (prevPath !== pathname) {
    setPrevPath(pathname);
    setOpen(false);
  }

  // 열려 있는 동안 뒤 화면 스크롤 잠금 + Esc 닫기
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="메뉴 열기"
        onClick={() => setOpen(true)}
        className="flex size-9 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 md:hidden"
      >
        <Menu className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="메뉴 닫기"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40"
          />
          <div className="absolute inset-y-0 left-0 flex">
            {children}
            <button
              type="button"
              aria-label="메뉴 닫기"
              onClick={() => setOpen(false)}
              className="ml-2 mt-3 flex size-9 items-center justify-center self-start rounded-full bg-white/90 text-gray-700 shadow"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
