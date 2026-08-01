"use client";

import { ArrowUp } from "lucide-react";

/**
 * 용지 더미를 따라다니는 맨 위로 버튼. 브라우저 끝(fixed)은 문서와 떨어져
 * 안 보인다는 피드백이라, 용지 기둥 안 sticky로 넣어 어느 스크롤 위치에서든
 * 문서 오른쪽 어깨에 붙어 있게 한다. h-0이라 용지 자리는 차지하지 않는다.
 */
export function BackToTop() {
  return (
    <div className="pointer-events-none sticky top-[82vh] z-10 h-0 text-right print:hidden">
      <button
        type="button"
        aria-label="맨 위로"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        className="pointer-events-auto inline-flex size-10 items-center justify-center rounded-full border bg-card text-gray-600 shadow-md transition-colors hover:bg-background hover:text-foreground"
      >
        <ArrowUp className="size-5" />
      </button>
    </div>
  );
}
