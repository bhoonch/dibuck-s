"use client";

import { useEffect } from "react";

const PX_PER_MM = 96 / 25.4;

/**
 * 인쇄를 한 장에 맞춘다 — 내용(사진·본문)이 인쇄 가능 높이를 넘치면 넘친
 * 비율만큼 용지를 zoom으로 줄인다. transform: scale이 아닌 이유: transform은
 * 레이아웃 높이가 그대로라 페이지 수가 안 준다 — 페이지 나눔에는 zoom만 먹힌다.
 * 여기서는 CSS 변수만 계산해 두고, 용지가 `print:[zoom:var(--print-fit,1)]`로
 * 소비하므로 화면 표시에는 영향이 없다.
 *
 * 문서마다 인쇄 여백 방식이 다르다:
 * - 공지문: @page 여백 0 + 용지 자체 여백 인쇄 유지 → 기본값 그대로 (297mm, 패딩 포함 측정)
 * - 교육일지: print:p-0 + @page 여백 14mm → printableMm 269(=297-28), subtractPadding
 *   (화면 패딩은 인쇄에서 @page 여백으로 대체되므로 내용 높이만 재야 한다)
 */
export function PrintFitOnePage({
  target = "a4-sheet",
  printableMm = 297,
  subtractPadding = false,
}: {
  target?: string;
  /** 인쇄 가능 높이(mm) — 297에서 @page 상·하 여백을 뺀 값 */
  printableMm?: number;
  /** print:p-0 문서용 — 화면 패딩을 측정에서 뺀다 */
  subtractPadding?: boolean;
}) {
  useEffect(() => {
    const el = document.getElementById(target);
    if (!el) return;
    // 반올림 오차로 2쪽이 되지 않게 0.5% 여유
    const pagePx = printableMm * PX_PER_MM * 0.995;
    const fit = () => {
      const cs = getComputedStyle(el);
      const pad = subtractPadding
        ? parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
        : 0;
      el.style.setProperty(
        "--print-fit",
        String(Math.min(1, pagePx / (el.scrollHeight - pad))),
      );
    };
    // 사진이 뒤늦게 로드되면 높이가 변한다 — 계속 관찰하고, 인쇄 직전 한 번 더
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("beforeprint", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("beforeprint", fit);
    };
  }, [target, printableMm, subtractPadding]);
  return null;
}
