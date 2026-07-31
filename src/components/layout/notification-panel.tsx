"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, BellOff, CheckCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { markAllRead, openNotification } from "@/app/(app)/notifications/actions";

export type PanelNotification = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  /** ISO 문자열 — 서버 컴포넌트에서 Date를 그대로 넘기지 않는다 */
  createdAt: string;
};

/**
 * 종 아이콘 + 우측 슬라이드 알림 창.
 *
 * 알림을 "이동해서 보는 페이지"가 아니라 어느 화면에서든 열고 닫는 겹으로 만든다 —
 * 홈 상단 카드(지금 쌓인 일의 상태)와 알림(그동안 일어난 사건)의 역할이 눈으로 갈라진다.
 * 여는 것만으로 읽음 처리하지 않는다 — 열자마자 버블이 0이 되면 "몇 개 남았나"가 사라진다.
 * 클릭한 것만 읽음(openNotification), 전체 이력은 /notifications 그대로.
 */
export function NotificationPanel({
  unread,
  items,
}: {
  unread: number;
  items: PanelNotification[];
}) {
  const [open, setOpen] = useState(false);

  // 열려 있는 동안 Esc로 닫기 — 마우스 없이도 빠져나올 수 있어야 한다
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString("ko-KR", {
      timeZone: "Asia/Seoul", // 서버 TZ와 무관하게 한국 날짜로
      month: "long",
      day: "numeric",
    });

  return (
    <>
      <button
        type="button"
        aria-label={unread > 0 ? `알림 ${unread}개 안 읽음` : "알림"}
        onClick={() => setOpen(true)}
        className="relative flex size-9 items-center justify-center rounded-md border bg-card transition-colors hover:bg-background"
      >
        <Bell className="size-5 text-gray-700" />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-[1.5px] border-white bg-red-600 px-1 font-mono text-[10px] font-bold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {/* 항상 마운트해 두고 transform만 토글한다 — 조건부 마운트면 밀려 들어오는
          전환이 불가능하다(나타나는 순간이 곧 첫 렌더라 시작 위치가 없다) */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/20 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-label="알림"
        aria-hidden={!open}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-[380px] max-w-[90vw] flex-col border-l bg-card shadow-xl transition-transform duration-200",
          open ? "translate-x-0" : "pointer-events-none translate-x-full",
        )}
      >
            <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
              <b className="text-base">알림</b>
              {unread > 0 && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 font-mono text-xs font-semibold text-red-700">
                  {unread}
                </span>
              )}
              {unread > 0 && (
                <form action={markAllRead} className="ml-auto">
                  <button
                    type="submit"
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-100 hover:text-foreground"
                  >
                    <CheckCheck className="size-3.5" /> 모두 읽음
                  </button>
                </form>
              )}
              {/* 바깥 클릭·Esc로도 닫히지만, 그 관례를 모르는 사용자에게는
                  보이는 닫기가 유일한 출구다 */}
              <button
                type="button"
                aria-label="알림 창 닫기"
                onClick={() => setOpen(false)}
                className={cn(
                  "flex size-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-foreground",
                  unread === 0 && "ml-auto",
                )}
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {items.length === 0 ? (
                <p className="flex flex-col items-center gap-2 py-16 text-sm text-gray-400">
                  <BellOff className="size-6" />
                  아직 알림이 없습니다
                </p>
              ) : (
                items.map((n) => (
                  // 클릭 = 읽음 처리 후 이동 — 그냥 Link면 배지가 영원히 안 줄어든다
                  <form key={n.id} action={openNotification}>
                    <input type="hidden" name="id" value={n.id} />
                    <input type="hidden" name="link" value={n.link ?? ""} />
                    <button
                      type="submit"
                      className={cn(
                        "block w-full border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-background",
                        !n.read && "border-l-2 border-l-primary",
                      )}
                    >
                      <span
                        className={cn(
                          "block text-sm font-medium",
                          n.read && "text-muted-foreground",
                        )}
                      >
                        {n.title}
                      </span>
                      {n.body && (
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {n.body}
                        </span>
                      )}
                      <span className="mt-1 block text-xs text-gray-400">
                        {date(n.createdAt)}
                      </span>
                    </button>
                  </form>
                ))
              )}
            </div>

            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="border-t border-gray-100 px-4 py-3 text-center text-sm font-semibold text-primary hover:bg-background"
            >
              전체 알림 보기
            </Link>
      </aside>
    </>
  );
}
