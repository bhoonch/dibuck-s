"use client";

import { useEffect } from "react";

/** A4 높이 297mm → CSS px. 반올림 오차로 2쪽이 되지 않게 0.5% 여유 */
const PAGE_PX = 297 * (96 / 25.4) * 0.995;

/**
 * 인쇄를 한 장에 맞춘다 — 내용(사진·본문)이 A4 높이를 넘치면 넘친 비율만큼
 * 용지를 zoom으로 줄인다. transform: scale이 아닌 이유: transform은 레이아웃
 * 높이가 그대로라 페이지 수가 안 줄어든다 — 페이지 나눔에는 zoom만 먹힌다.
 * 여기서는 CSS 변수만 계산해 두고, 용지가 print: 변형으로 소비하므로 화면
 * 표시에는 영향이 없다.
 */
export function PrintFitOnePage({ target = "a4-sheet" }: { target?: string }) {
  useEffect(() => {
    const el = document.getElementById(target);
    if (!el) return;
    const fit = () =>
      el.style.setProperty(
        "--print-fit",
        String(Math.min(1, PAGE_PX / el.scrollHeight)),
      );
    // 사진이 뒤늦게 로드되면 높이가 변한다 — 계속 관찰하고, 인쇄 직전 한 번 더
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("beforeprint", fit);
    return () => {
      ro.disconnect();
      window.removeEventListener("beforeprint", fit);
    };
  }, [target]);
  return null;
}
