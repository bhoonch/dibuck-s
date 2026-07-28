"use client";

import { useEffect, useRef, useState } from "react";

/** A4 폭 210mm를 CSS px로 — 용지 컴포넌트가 lg:w-[210mm]로 고정하는 값과 같다 */
const A4_PX = 210 * (96 / 25.4);

/**
 * A4 용지를 들어갈 칸 폭에 맞춰 축소한다.
 *
 * 용지는 `w-[210mm] shrink-0`이라 칸이 좁아도 줄지 않고 옆 패널을 뚫고 나간다
 * (1440px 화면에서도 26px 넘쳤다). 칸 폭을 재서 `zoom`으로 비율만 낮춘다 —
 * `transform: scale`과 달리 `zoom`은 레이아웃 상자까지 줄여서 아래 요소가
 * 빈 공간 위에 뜨지 않는다.
 *
 * 인쇄는 종이 위 크기가 기준이므로 배율을 걸지 않는다(print:[zoom:1]).
 * 칸이 210mm보다 넓으면 확대하지 않고 1배로 둔다.
 */
export function PaperScale({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setScale(Math.min(1, entry.contentRect.width / A4_PX)),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className="w-full">
      <div
        style={{ "--paper-scale": scale } as React.CSSProperties}
        className="mx-auto w-fit [zoom:var(--paper-scale)] print:[zoom:1]"
      >
        {children}
      </div>
    </div>
  );
}
