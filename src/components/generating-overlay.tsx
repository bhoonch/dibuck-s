"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/**
 * AI 생성 대기 — 폼 위를 덮는 반투명 막. 부모에 relative가 필요하다.
 * 경과 초를 세는 이유: 10~30초짜리 대기에서 "멈춘 건지 도는 건지"를 가르는 건
 * 스피너가 아니라 숫자가 올라가는 것이다.
 * (기안 폼은 문서 팔레트(--gian-*)를 쓰는 자체 변형을 유지한다)
 */
export function GeneratingOverlay({ label }: { label: string }) {
  const [sec, setSec] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="absolute inset-0 z-10 rounded-lg bg-white/85 backdrop-blur-[1px]">
      {/* sticky — 폼이 길어서 세로 중앙 정렬이면 안내가 화면 밖에 놓인다. 스크롤 위치와 무관하게 보이는 자리 */}
      <div className="sticky top-[35vh] flex flex-col items-center gap-3">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
        <p className="text-base font-bold">{label}</p>
        <p className="text-sm text-muted-foreground">
          보통 10~30초 걸립니다 · <span className="font-mono">{sec}초</span> 경과
        </p>
      </div>
    </div>
  );
}
