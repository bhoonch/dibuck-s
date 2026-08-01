"use client";

import { ArrowUp } from "lucide-react";

/**
 * 용지 더미를 따라다니는 맨 위로 버튼. 브라우저 끝(fixed)은 문서와 떨어져
 * 안 보이고, 용지 위에 얹으면 겹친다는 피드백 — 용지 기둥 안 sticky를
 * 용지 오른쪽 바깥(우측 카드와의 간격)으로 밀어내 문서 옆에 붙어 다니게 한다.
 * 2단이 되는 xl부터만 — 그 아래에서는 옆에 놓을 빈 자리가 없다.
 */
export function BackToTop() {
  return (
    <div className="pointer-events-none sticky top-[82vh] z-10 hidden h-0 xl:block print:hidden">
      <button
        type="button"
        aria-label="맨 위로"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        // ml-6 = 격자 gap-6 — 우측 카드 기둥의 왼쪽 시작선과 같은 라인에 선다
        className="pointer-events-auto absolute left-full ml-6 inline-flex size-9 items-center justify-center rounded-full border bg-card text-gray-600 shadow-md transition-colors hover:bg-background hover:text-foreground"
      >
        <ArrowUp className="size-5" />
      </button>
    </div>
  );
}
